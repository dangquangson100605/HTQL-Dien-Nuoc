import logging

from rest_framework.exceptions import APIException
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Bọc exception DRF; các lỗi chưa được DRF xử lý trả JSON 500 (không lộ traceback cho client).
    """
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
