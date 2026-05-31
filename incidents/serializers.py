from rest_framework import serializers
from accounts.models import User
from .models import Incident, IncidentNote, Notification, IncidentHistory
from assets.serializers import DeviceMinimalSerializer, NetworkEdgeSerializer, WardSerializer
from assets.spatial import coordinates_match_ward, user_can_access_ward

class IncidentHistorySerializer(serializers.ModelSerializer):
    changed_by_username = serializers.CharField(source='changed_by.username', read_only=True, allow_null=True)
    
    class Meta:
        model = IncidentHistory
        fields = ['id', 'old_status', 'new_status', 'note', 'changed_by', 'changed_by_username', 'created_at']
        read_only_fields = ['id', 'created_at']


class IncidentNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.get_full_name', read_only=True)
    author_username = serializers.CharField(source='author.username', read_only=True)

    class Meta:
        model = IncidentNote
        fields = ['id', 'incident', 'author', 'author_name', 'author_username', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'created_at']


class IncidentSerializer(serializers.ModelSerializer):
    reported_by_username = serializers.CharField(source='reported_by.username', read_only=True)
    assigned_to_username = serializers.CharField(source='assigned_to.username', read_only=True, allow_null=True)
    assigned_technicians = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    assigned_technician_usernames = serializers.SerializerMethodField()
    confirmed_by_username = serializers.CharField(source='confirmed_by.username', read_only=True, allow_null=True)
    device_name = serializers.CharField(source='device.name', read_only=True, allow_null=True)
    edge_name = serializers.CharField(source='edge.name', read_only=True, allow_null=True)
    device_detail = DeviceMinimalSerializer(source='device', read_only=True)
    edge_detail = NetworkEdgeSerializer(source='edge', read_only=True)
    notes = IncidentNoteSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    type_display = serializers.CharField(source='get_incident_type_display', read_only=True)
    history = serializers.SerializerMethodField()
    ward_name = serializers.CharField(source='ward.name', read_only=True)
    ward_district = serializers.CharField(source='ward.district', read_only=True)
    ward_detail = WardSerializer(source='ward', read_only=True)

    class Meta:
        model = Incident
        fields = [
            'id', 'title', 'description', 'incident_type', 'type_display',
            'severity', 'severity_display', 'status', 'status_display',
            'latitude', 'longitude',
            'device', 'device_name', 'device_detail',
            'edge', 'edge_name', 'edge_detail',
            'reported_by', 'reported_by_username',
            'assigned_to', 'assigned_to_username',
            'assigned_technicians', 'assigned_technician_usernames',
            'confirmed_by', 'confirmed_by_username',
            'ward', 'ward_name', 'ward_district', 'ward_detail',
            'address', 'area',
            'rejection_reason', 'result_note', 'target_type',
            'notes', 'history', 'created_at', 'updated_at', 'resolved_at',
        ]
        read_only_fields = ['id', 'reported_by', 'created_at', 'updated_at', 'area']

    def get_assigned_technician_usernames(self, obj):
        usernames = list(obj.assigned_technicians.values_list('username', flat=True))
        if not usernames and obj.assigned_to_id:
            return [obj.assigned_to.username]
        return usernames

    def get_history(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if not user or not user.is_authenticated or user.role != User.Role.ADMIN:
            return []
        return IncidentHistorySerializer(obj.history.all(), many=True).data

    def validate_ward(self, value):
        if not value:
            raise serializers.ValidationError('Phường/Xã là bắt buộc.')
        request = self.context.get('request')
        if request and request.user.is_authenticated and request.user.role == 'CITIZEN':
            return value
        if request and request.user.is_authenticated:
            if not user_can_access_ward(request.user, value.id):
                raise serializers.ValidationError('Bạn không có quyền trên phường/xã này.')
        return value

    def validate(self, attrs):
        target_type = attrs.get('target_type', getattr(self.instance, 'target_type', 'UNKNOWN'))
        device = attrs.get('device', getattr(self.instance, 'device', None))
        edge = attrs.get('edge', getattr(self.instance, 'edge', None))

        # Handle automatic fallback if target_type is UNKNOWN but device/edge is provided
        if target_type == 'UNKNOWN' or not target_type:
            if device and not edge:
                target_type = 'DEVICE'
                attrs['target_type'] = 'DEVICE'
            elif edge and not device:
                target_type = 'EDGE'
                attrs['target_type'] = 'EDGE'

        if target_type == 'DEVICE' and not device:
            raise serializers.ValidationError({"device": "Thiết bị liên quan không được rỗng khi target_type là DEVICE."})

        if target_type == 'EDGE' and not edge:
            raise serializers.ValidationError({"edge": "Tuyến liên quan không được rỗng khi target_type là EDGE."})

        if device and edge:
            raise serializers.ValidationError("Một sự cố không thể vừa gắn thiết bị vừa gắn tuyến.")

        ward = attrs.get('ward', getattr(self.instance, 'ward', None))
        if device and device.ward_id:
            attrs['ward'] = device.ward
            ward = device.ward
        elif not ward:
            raise serializers.ValidationError({'ward': 'Phường/Xã là bắt buộc.'})

        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        if ward and lat is not None and lng is not None:
            if not coordinates_match_ward(ward, float(lat), float(lng)):
                raise serializers.ValidationError({
                    'latitude': 'Tọa độ không khớp với phường/xã đã chọn. Vui lòng chọn lại trên bản đồ.',
                    'longitude': 'Tọa độ không khớp với phường/xã đã chọn. Vui lòng chọn lại trên bản đồ.',
                })

        return attrs


    def validate_latitude(self, value):
        if value < -90 or value > 90:
            raise serializers.ValidationError("Vĩ độ phải trong khoảng [-90, 90].")
        return value

    def validate_longitude(self, value):
        if value < -180 or value > 180:
            raise serializers.ValidationError("Kinh độ phải trong khoảng [-180, 180].")
        return value


class NotificationSerializer(serializers.ModelSerializer):
    incident_title = serializers.CharField(source='incident.title', read_only=True, allow_null=True)
    incident_status = serializers.CharField(source='incident.status', read_only=True, allow_null=True)
    device_name = serializers.CharField(source='device.name', read_only=True, allow_null=True)
    device_code = serializers.CharField(source='device.code', read_only=True, allow_null=True)

    class Meta:
        model = Notification
        fields = ['id', 'incident', 'incident_title', 'incident_status',
                  'device', 'device_name', 'device_code',
                  'notif_type', 'message', 'is_read', 'created_at']
        read_only_fields = ['id', 'incident', 'device', 'notif_type', 'message', 'created_at']


class SystemJournalSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    incident_title = serializers.CharField(source='incident.title', read_only=True, allow_null=True)
    device_name = serializers.CharField(source='device.name', read_only=True, allow_null=True)

    class Meta:
        from .models import SystemJournal
        model = SystemJournal
        fields = [
            'id', 'actor', 'actor_username', 'category', 'category_display',
            'action', 'action_display', 'summary', 'details',
            'incident', 'incident_title', 'device', 'device_name', 'created_at',
        ]
        read_only_fields = fields
