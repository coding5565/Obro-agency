"""CSV eksport: Excel o'zbekcha harflarni to'g'ri ochadi va katakdagi matn formula bo'lib ishlamaydi."""
import csv
from decimal import Decimal

from django.http import HttpResponse


def csv_safe(value):
    """Excel «=», «+», «-», «@» bilan boshlangan katakni formula deb ishga tushiradi; matn tashqaridan keladi."""
    text = "" if value is None else str(value)
    if text[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text


def csv_response(filename, header, rows):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.write("﻿")
    writer = csv.writer(response)
    writer.writerow(header)
    for row in rows:
        # Son o'z minus belgisini saqlaydi: u formula emas.
        writer.writerow([cell if isinstance(cell, (int, float, Decimal)) else csv_safe(cell) for cell in row])
    return response
