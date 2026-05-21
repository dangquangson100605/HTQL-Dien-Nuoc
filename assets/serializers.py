from rest_framework import serializers

from .models import Device, ConsumptionLog, NetworkEdge


class DeviceSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)

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
            "area",
            "latitude",
            "longitude",
            "status",
            "status_display",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "code", "created_at", "updated_at")

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


class DeviceMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = (
            "id",
            "code",
            "name",
            "device_type",
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

