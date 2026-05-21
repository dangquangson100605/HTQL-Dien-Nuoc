from rest_framework import serializers
from accounts.models import User
from .models import Incident, IncidentNote, Notification
from assets.serializers import DeviceMinimalSerializer, NetworkEdgeSerializer


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
    confirmed_by_username = serializers.CharField(source='confirmed_by.username', read_only=True, allow_null=True)
    device_name = serializers.CharField(source='device.name', read_only=True, allow_null=True)
    edge_name = serializers.CharField(source='edge.name', read_only=True, allow_null=True)
    device_detail = DeviceMinimalSerializer(source='device', read_only=True)
    edge_detail = NetworkEdgeSerializer(source='edge', read_only=True)
    notes = IncidentNoteSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    severity_display = serializers.CharField(source='get_severity_display', read_only=True)
    type_display = serializers.CharField(source='get_incident_type_display', read_only=True)

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
            'confirmed_by', 'confirmed_by_username',
            'address', 'area',
            'rejection_reason', 'result_note', 'target_type',
            'notes', 'created_at', 'updated_at', 'resolved_at',
        ]
        read_only_fields = ['id', 'reported_by', 'created_at', 'updated_at']

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
    incident_title = serializers.CharField(source='incident.title', read_only=True)
    incident_status = serializers.CharField(source='incident.status', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'incident', 'incident_title', 'incident_status',
                  'notif_type', 'message', 'is_read', 'created_at']
        read_only_fields = ['id', 'incident', 'notif_type', 'message', 'created_at']
