from rest_framework import serializers

from .models import Device, ConsumptionLog, NetworkEdge, Ward
from .spatial import user_can_access_ward


class WardSerializer(serializers.ModelSerializer):
    full_label = serializers.CharField(read_only=True)
    unit_type_display = serializers.CharField(source='get_unit_type_display', read_only=True)

    class Meta:
        model = Ward
        fields = (
            'id', 'code', 'name', 'short_name', 'district',
            'unit_type', 'unit_type_display', 'latitude', 'longitude',
            'full_label', 'is_active',
        )


class DeviceSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    ward_district = serializers.CharField(source='ward.district', read_only=True)
    ward_detail = WardSerializer(source='ward', read_only=True)
    maintenance_assigned_to_username = serializers.CharField(
        source='maintenance_assigned_to.username', read_only=True, allow_null=True,
    )
    maintenance_assigned_technicians = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    maintenance_assigned_technician_usernames = serializers.SerializerMethodField()
    maintenance_pending_operator = serializers.SerializerMethodField()
    maintenance_acknowledged_by_username = serializers.CharField(
        source='maintenance_acknowledged_by.username', read_only=True, allow_null=True,
    )
    maintenance_completed_by_username = serializers.CharField(
        source='maintenance_completed_by.username', read_only=True, allow_null=True,
    )

    class Meta:
        model = Device
        fields = (
            "id",
            "code",
            "name",
            "device_type",
            "parent",
            "attributes",
            "address",
            "ward",
            "ward_name",
            "ward_district",
            "ward_detail",
            "area",
            "latitude",
            "longitude",
            "status",
            "status_display",
            "is_active",
            "maintenance_assigned_to",
            "maintenance_assigned_to_username",
            "maintenance_assigned_technicians",
            "maintenance_assigned_technician_usernames",
            "maintenance_note",
            "maintenance_assigned_at",
            "maintenance_acknowledged_at",
            "maintenance_acknowledged_by",
            "maintenance_acknowledged_by_username",
            "maintenance_completed_at",
            "maintenance_completed_by",
            "maintenance_completed_by_username",
            "maintenance_result_note",
            "maintenance_pending_operator",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id", "code", "created_at", "updated_at", "area",
            "maintenance_assigned_to", "maintenance_assigned_technicians",
            "maintenance_note", "maintenance_assigned_at",
            "maintenance_acknowledged_at", "maintenance_acknowledged_by",
            "maintenance_completed_at", "maintenance_completed_by",
            "maintenance_result_note", "maintenance_pending_operator",
        )

    def get_maintenance_assigned_technician_usernames(self, obj):
        usernames = list(obj.maintenance_assigned_technicians.values_list('username', flat=True))
        if not usernames and obj.maintenance_assigned_to_id:
            return [obj.maintenance_assigned_to.username]
        return usernames

    def get_maintenance_pending_operator(self, obj):
        return bool(
            obj.status == Device.Status.MAINTENANCE
            and obj.maintenance_completed_at
        )

    def validate_ward(self, value):
        if not value:
            raise serializers.ValidationError('Phường/Xã là bắt buộc.')
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if not user_can_access_ward(request.user, value.id):
                raise serializers.ValidationError('Bạn không có quyền thao tác trên phường/xã này.')
        return value

    def validate_latitude(self, value: float) -> float:
        if value < -90 or value > 90:
            raise serializers.ValidationError("Vĩ độ phải trong khoảng [-90, 90].")
        return value

    def validate_longitude(self, value: float) -> float:
        if value < -180 or value > 180:
            raise serializers.ValidationError("Kinh độ phải trong khoảng [-180, 180].")
        return value

    def validate_name(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Tên thiết bị không được để trống.")
        return value

    def validate(self, attrs):
        ward = attrs.get('ward') or (self.instance.ward if self.instance else None)
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))

        if ward and lat is not None and lng is not None:
            from .spatial import coordinates_match_ward
            if not coordinates_match_ward(ward, float(lat), float(lng)):
                raise serializers.ValidationError({
                    'latitude': 'Tọa độ không khớp với phường/xã đã chọn. Vui lòng chọn lại trên bản đồ.',
                    'longitude': 'Tọa độ không khớp với phường/xã đã chọn. Vui lòng chọn lại trên bản đồ.',
                })

        parent = attrs.get('parent')
        device_type = attrs.get('device_type') or (self.instance.device_type if self.instance else None)
        if parent and device_type:
            from .models import device_network_type
            try:
                child_net = device_network_type(device_type)
                parent_net = device_network_type(parent.device_type)
            except ValueError:
                child_net = parent_net = None
            if child_net and parent_net and child_net != parent_net:
                raise serializers.ValidationError({
                    'parent': 'Nguồn cấp phải cùng loại mạng (điện hoặc nước) với thiết bị.',
                })

        return attrs

class ConsumptionLogSerializer(serializers.ModelSerializer):
    device_name = serializers.CharField(source='device.name', read_only=True)
    device_type = serializers.CharField(source='device.device_type', read_only=True)

    class Meta:
        model = ConsumptionLog
        fields = (
            "id",
            "device",
            "device_name",
            "device_type",
            "date",
            "value",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_value(self, value: float) -> float:
        if value < 0:
            raise serializers.ValidationError("Chỉ số tiêu thụ không được âm.")
        return value

    def validate(self, attrs):
        device = attrs.get('device') or (self.instance.device if self.instance else None)
        date = attrs.get('date') or (self.instance.date if self.instance else None)
        
        if device and date:
            # Chuẩn hóa về ngày mùng 1 đầu tháng giống như cách model lưu trữ
            normalized_date = date.replace(day=1)
            
            # Kiểm tra xem bản ghi cho thiết bị này trong tháng đó đã tồn tại chưa
            qs = ConsumptionLog.objects.filter(device=device, date=normalized_date)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "date": f"Nhật ký tiêu thụ cho thiết bị này trong tháng {normalized_date.month}/{normalized_date.year} đã tồn tại."
                })
        return attrs


class DeviceMinimalSerializer(serializers.ModelSerializer):
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    ward_district = serializers.CharField(source='ward.district', read_only=True)

    class Meta:
        model = Device
        fields = (
            "id",
            "code",
            "name",
            "device_type",
            "ward",
            "ward_name",
            "ward_district",
            "latitude",
            "longitude",
            "status",
        )


class NetworkEdgeSerializer(serializers.ModelSerializer):
    from_device_detail = DeviceMinimalSerializer(source="from_device", read_only=True)
    to_device_detail = DeviceMinimalSerializer(source="to_device", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = NetworkEdge
        fields = (
            "id",
            "code",
            "name",
            "from_device",
            "to_device",
            "from_device_detail",
            "to_device_detail",
            "network_type",
            "status",
            "status_display",
            "description",
            "attributes",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "code", "created_at", "updated_at")

