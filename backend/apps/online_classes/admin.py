from django.contrib import admin

from .models import (
    OnlineClass,
    OnlineClassEnrollment,
    OnlineClassPayment,
    OnlineClassReview,
    OnlineClassSession,
)

admin.site.register(OnlineClass)
admin.site.register(OnlineClassSession)
admin.site.register(OnlineClassEnrollment)
admin.site.register(OnlineClassPayment)
admin.site.register(OnlineClassReview)
