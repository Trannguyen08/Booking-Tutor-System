import math
from django.db.models.query import QuerySet
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """Unified 10-items-per-page DRF pagination across Admin, Tutor, and Client lists."""

    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": page_size,
                "total_pages": self.page.paginator.num_pages,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )


StandardPageNumberPagination = StandardResultsSetPagination


def parse_page_params(request, default_page_size: int = 10):
    raw_page = request.query_params.get("page")
    raw_size = request.query_params.get("page_size")
    try:
        page = max(1, int(raw_page or 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = min(100, max(1, int(raw_size or default_page_size)))
    except (TypeError, ValueError):
        page_size = default_page_size
    return page, page_size


def paginate_items(
    request,
    source,
    serializer_cls=None,
    serializer_context=None,
    default_page_size: int = 10,
):
    """
    Slices a Django QuerySet (using SQL COUNT + LIMIT/OFFSET before serialization)
    or a Python list into a uniform paginated dict.
    """
    page, page_size = parse_page_params(request, default_page_size=default_page_size)
    if isinstance(source, QuerySet):
        total = source.count()
        total_pages = max(1, math.ceil(total / page_size))
        page = min(page, total_pages)
        offset = (page - 1) * page_size
        chunk = list(source[offset : offset + page_size])
    else:
        items = list(source)
        total = len(items)
        total_pages = max(1, math.ceil(total / page_size))
        page = min(page, total_pages)
        offset = (page - 1) * page_size
        chunk = items[offset : offset + page_size]

    if serializer_cls is not None:
        serialized = serializer_cls(
            chunk, many=True, context=serializer_context or {}
        ).data
    else:
        serialized = chunk

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "results": serialized,
    }


def paginate_if_requested(
    request,
    source,
    serializer_cls=None,
    serializer_context=None,
    default_page_size: int = 10,
):
    """
    Returns standard paginated dict when ?page= is passed (using SQL slicing for speed),
    while preserving legacy list responses when called without ?page=.
    """
    if request.query_params.get("page") is not None:
        return paginate_items(
            request,
            source,
            serializer_cls=serializer_cls,
            serializer_context=serializer_context,
            default_page_size=default_page_size,
        )
    if serializer_cls is not None:
        return serializer_cls(
            source, many=True, context=serializer_context or {}
        ).data
    return list(source)
