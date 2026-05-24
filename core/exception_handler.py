import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Bọc exception DRF; các lỗi chưa được DRF xử lý trả JSON 500 (không lộ traceback cho client).
    Django ValidationError (từ model clean/save) được chuyển thành 400.
    """
    # Chuyển Django ValidationError thành 400 response
    if isinstance(exc, DjangoValidationError):
        if hasattr(exc, 'message_dict'):
            data = exc.message_dict
        elif hasattr(exc, 'messages'):
            data = {'detail': exc.messages}
        else:
            data = {'detail': str(exc)}
        return Response(data, status=400)

    response = drf_exception_handler(exc, context)
    if response is not None:
        if not isinstance(exc, APIException):
            pass
        return response

    logger.error("Unhandled exception", exc_info=exc)
    return Response(
        {"detail": "Lỗi máy chủ nội bộ.", "code": "server_error"},
        status=500,
    )
