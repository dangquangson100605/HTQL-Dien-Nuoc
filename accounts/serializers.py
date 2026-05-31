from django.contrib.auth import login as django_login
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from assets.models import Ward
from .models import User, AuditLog


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Đăng nhập JWT; trả thêm vai trò trong body (không cần giải mã token)."""

    @classmethod
    def get_token(cls, user: User):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        request = self.context.get("request")
        if request is not None:
            # Keep a server-side session so template pages can enforce auth.
            django_login(request, user)
        data["role"] = user.role
        data["username"] = user.username
        data["user_id"] = user.id
        return data


class UserSerializer(serializers.ModelSerializer):
    managed_ward_ids = serializers.SerializerMethodField()
    managed_ward_names = serializers.SerializerMethodField()
    managed_ward_ids_write = serializers.PrimaryKeyRelatedField(
        source='managed_wards',
        many=True,
        queryset=Ward.objects.filter(is_active=True),
        required=False,
        write_only=True,
    )

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "role", "password", "is_active",
            "managed_ward_ids", "managed_ward_names", "managed_ward_ids_write",
        ]
        extra_kwargs = {"password": {"write_only": True, "required": False}}

    def get_managed_ward_ids(self, obj):
        return list(obj.managed_wards.values_list('id', flat=True))

    def get_managed_ward_names(self, obj):
        return [w.name for w in obj.managed_wards.all()]

    def to_internal_value(self, data):
        if isinstance(data, dict) and 'managed_ward_ids' in data and 'managed_ward_ids_write' not in data:
            data = data.copy()
            data['managed_ward_ids_write'] = data['managed_ward_ids']
        return super().to_internal_value(data)

    def validate(self, attrs):
        role = attrs.get('role', getattr(self.instance, 'role', None))
        wards = attrs.get('managed_wards')

        if role in (User.Role.OPERATOR, User.Role.TECHNICIAN):
            if wards is not None:
                effective = wards
            elif self.instance is not None and self.instance.role == role:
                effective = list(self.instance.managed_wards.all())
            else:
                effective = []
            if not effective:
                raise serializers.ValidationError({
                    'managed_ward_ids': 'Nhân viên vận hành / KTV phải được phân ít nhất một phường/xã.',
                })
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        wards = validated_data.pop("managed_wards", [])
        role = validated_data.get('role', User.Role.CITIZEN)
        if not password:
            raise serializers.ValidationError({"password": "Mật khẩu là bắt buộc khi tạo tài khoản."})
        if role in (User.Role.ADMIN, User.Role.CITIZEN):
            wards = []
        user = super().create(validated_data)
        user.set_password(password)
        user.save()
        if wards:
            user.managed_wards.set(wards)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        wards = validated_data.pop("managed_wards", None)
        new_role = validated_data.get('role', instance.role)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save()
        if new_role in (User.Role.ADMIN, User.Role.CITIZEN):
            user.managed_wards.clear()
        elif wards is not None:
            user.managed_wards.set(wards)
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        validate_password(value)
        return value


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='Anonymous')

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'username', 'action', 'path', 'ip_address', 'timestamp', 'details']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "first_name", "last_name"]

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        validate_password(value)
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email", ""),
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            role=User.Role.CITIZEN  # Force CITIZEN role!
        )
        return user
