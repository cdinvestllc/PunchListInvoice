import io
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfgen import canvas as rl_canvas
from uploads import UPLOAD_DIR

BLUE = colors.HexColor("#2563EB")
SLATE = colors.HexColor("#0F172A")
GRAY = colors.HexColor("#64748B")
LIGHT = colors.HexColor("#F1F5F9")


def fmt_money(n):
    return f"${float(n or 0):,.2f}"


def fmt_date(s):
    try:
        return datetime.fromisoformat(str(s)[:10]).strftime("%b %d, %Y")
    except Exception:
        return s or "—"


def _watermark(c, cfg, width, height):
    if not cfg.get("enabled"):
        return
    c.saveState()
    try:
        opacity = float(cfg.get("opacity", 0.12))
        c.setFillAlpha(opacity)
        img_path = cfg.get("image_path")
        if img_path and not str(img_path).startswith("http"):
            p = UPLOAD_DIR / img_path
            if p.is_file():
                size = float(cfg.get("size", 44)) * 4
                c.drawImage(str(p), width / 2 - size / 2, height / 2 - size / 4, size, size / 2,
                            preserveAspectRatio=True, mask="auto")
                c.restoreState()
                return
        text = cfg.get("text", "Created with Quote Flow Free")
        size = int(cfg.get("size", 44))
        c.setFillColor(GRAY)
        c.setFont("Helvetica-Bold", size)
        if cfg.get("position") == "footer":
            c.setFillAlpha(max(opacity, 0.4))
            c.setFont("Helvetica", 9)
            c.drawCentredString(width / 2, 0.45 * inch, text)
        else:
            c.translate(width / 2, height / 2)
            c.rotate(45)
            c.drawCentredString(0, 0, text)
    finally:
        c.restoreState()


def build_pdf(kind, doc, items, professional, user, settings, watermark_cfg, apply_watermark):
    """kind: 'QUOTE' | 'INVOICE'. Server-side generated; totals already recomputed by caller."""
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=letter)
    width, height = letter
    if apply_watermark:
        _watermark(c, watermark_cfg, width, height)

    biz = (professional or {}).get("business_name") or user.get("name", "")
    y = height - 0.9 * inch

    logo_drawn = False
    logo_path = (professional or {}).get("logo_path")
    if logo_path and not str(logo_path).startswith("http"):
        p = UPLOAD_DIR / logo_path
        if p.is_file():
            try:
                c.drawImage(str(p), 0.9 * inch, y - 0.5 * inch, 1.4 * inch, 0.6 * inch,
                            preserveAspectRatio=True, anchor="w", mask="auto")
                logo_drawn = True
            except Exception:
                logo_drawn = False
    if not logo_drawn:
        c.setFillColor(BLUE)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(0.9 * inch, y - 0.2 * inch, biz[:40])

    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(width - 0.9 * inch, y - 0.15 * inch, kind)
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    number = doc.get("quote_number") or doc.get("invoice_number") or ""
    c.drawRightString(width - 0.9 * inch, y - 0.38 * inch, f"{number}")
    date_label = "Due Date" if kind == "INVOICE" else "Expiry Date"
    other = doc.get("due_date") if kind == "INVOICE" else doc.get("expiry_date")
    c.drawRightString(width - 0.9 * inch, y - 0.56 * inch, f"Issued: {fmt_date(doc.get('issue_date'))}")
    c.drawRightString(width - 0.9 * inch, y - 0.72 * inch, f"{date_label}: {fmt_date(other)}")

    y -= 1.1 * inch
    c.setFillColor(GRAY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(0.9 * inch, y, "FROM")
    c.drawString(3.4 * inch, y, "BILL TO")
    y -= 0.18 * inch
    c.setFont("Helvetica", 10)
    c.setFillColor(SLATE)
    from_lines = [biz, (professional or {}).get("address", ""), (professional or {}).get("phone", ""),
                  (professional or {}).get("email", "")]
    to_lines = [doc.get("customer_name", ""), doc.get("customer_address", ""), doc.get("customer_phone", ""),
                doc.get("customer_email", "")]
    for i in range(4):
        if i < len(from_lines) and from_lines[i]:
            c.drawString(0.9 * inch, y - i * 0.16 * inch, str(from_lines[i])[:50])
        if i < len(to_lines) and to_lines[i]:
            c.drawString(3.4 * inch, y - i * 0.16 * inch, str(to_lines[i])[:50])
    y -= 0.85 * inch

    if doc.get("job_description"):
        c.setFillColor(GRAY)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(0.9 * inch, y, "JOB DESCRIPTION")
        y -= 0.16 * inch
        c.setFont("Helvetica", 9.5)
        c.setFillColor(SLATE)
        for line in _wrap(doc["job_description"], 95):
            c.drawString(0.9 * inch, y, line)
            y -= 0.15 * inch
        y -= 0.1 * inch

    c.setFillColor(LIGHT)
    c.rect(0.9 * inch, y - 0.05 * inch, width - 1.8 * inch, 0.28 * inch, stroke=0, fill=1)
    c.setFillColor(SLATE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(1.0 * inch, y + 0.04 * inch, "DESCRIPTION")
    c.drawRightString(4.9 * inch, y + 0.04 * inch, "QTY")
    c.drawRightString(5.9 * inch, y + 0.04 * inch, "UNIT PRICE")
    c.drawRightString(7.6 * inch, y + 0.04 * inch, "TOTAL")
    y -= 0.32 * inch
    c.setFont("Helvetica", 9.5)
    for it in items:
        if y < 1.8 * inch:
            c.showPage()
            if apply_watermark:
                _watermark(c, watermark_cfg, width, height)
            y = height - 1.0 * inch
            c.setFont("Helvetica", 9.5)
        line_total = round(float(it["qty"]) * float(it["unit_price"]), 2)
        c.setFillColor(SLATE)
        c.drawString(1.0 * inch, y, str(it["description"])[:55])
        c.drawRightString(4.9 * inch, y, f"{it['qty']:g}")
        c.drawRightString(5.9 * inch, y, fmt_money(it["unit_price"]))
        c.drawRightString(7.6 * inch, y, fmt_money(line_total))
        y -= 0.2 * inch
        c.setStrokeColor(LIGHT)
        c.line(0.9 * inch, y + 0.06 * inch, width - 0.9 * inch, y + 0.06 * inch)

    y -= 0.15 * inch
    c.setFont("Helvetica", 10)
    c.setFillColor(GRAY)
    c.drawRightString(6.6 * inch, y, "Subtotal:")
    c.setFillColor(SLATE)
    c.drawRightString(7.6 * inch, y, fmt_money(doc.get("subtotal")))
    y -= 0.18 * inch
    c.setFillColor(GRAY)
    c.drawRightString(6.6 * inch, y, f"Tax ({doc.get('tax_rate', 0):g}%):")
    c.setFillColor(SLATE)
    c.drawRightString(7.6 * inch, y, fmt_money(doc.get("tax_amount")))
    y -= 0.24 * inch
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(6.6 * inch, y, "Total:")
    c.drawRightString(7.6 * inch, y, fmt_money(doc.get("total")))

    if doc.get("notes"):
        y -= 0.45 * inch
        c.setFillColor(GRAY)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(0.9 * inch, y, "NOTES")
        y -= 0.15 * inch
        c.setFont("Helvetica", 9)
        c.setFillColor(SLATE)
        for line in _wrap(doc["notes"], 100):
            if y < 0.9 * inch:
                break
            c.drawString(0.9 * inch, y, line)
            y -= 0.14 * inch

    c.setFillColor(GRAY)
    c.setFont("Helvetica", 8)
    c.drawCentredString(width / 2, 0.6 * inch, f"Questions? {settings.get('support_phone', '')}")
    c.showPage()
    c.save()
    return buf.getvalue()


def _wrap(text, width_chars):
    words = str(text).split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines or [""]
