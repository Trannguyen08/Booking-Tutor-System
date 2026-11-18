from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    bank_qr_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "phone",
            "bio",
            "bank_name",
            "bank_account_number",
            "bank_account_holder",
            "bank_branch",
            "bank_qr_image",
            "bank_qr_url",
            "is_tutor",
            "is_verified",
            "is_staff",
            "is_superuser",
            "avatar",
            "avatar_url",
            "created_at",
        )
        read_only_fields = (
            "id",
            "email",
            "created_at",
            "is_tutor",
            "is_verified",
            "is_staff",
            "is_superuser",
            "avatar_url",
            "bank_qr_url",
        )

    def _build_media_url(self, field):
        if not field:
            return ""
        request = self.context.get("request")
        url = field.url
        return (
            request.build_absolute_uri(url) if request and url.startswith("/") else url
        )

    def get_avatar_url(self, obj):
        return self._build_media_url(obj.avatar)

    def get_bank_qr_url(self, obj):
        return self._build_media_url(obj.bank_qr_image)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
    password_confirm = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ("username", "email", "password", "password_confirm", "phone")
        extra_kwargs = {"email": {"required": True}}

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password": "Password fields didn't match."}
            )
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            phone=validated_data.get("phone", ""),
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, required=True)


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    code = serializers.CharField(max_length=6, required=True)


class GoogleAuthSerializer(serializers.Serializer):
    id_token = serializers.CharField(required=True)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True, required=True)
    new_password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    code = serializers.CharField(max_length=6, required=True)
    new_password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password]
    )
