from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.colors import HexColor
import os

OUT = os.path.join('output', 'pdf', 'lista-de-compras-checklist.pdf')
os.makedirs(os.path.dirname(OUT), exist_ok=True)

PAGE_W, PAGE_H = A4
navy = HexColor('#17324D')
blue = HexColor('#2F80ED')
light_blue = HexColor('#EAF3FF')
ink = HexColor('#243447')
muted = HexColor('#6B7785')
line = HexColor('#D9E2EC')
green = HexColor('#2E9B68')

class ChecklistDocTemplate(SimpleDocTemplate):
    def handle_pageBegin(self):
        super().handle_pageBegin()

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(line)
    canvas.setLineWidth(0.6)
    canvas.line(18*mm, 16*mm, PAGE_W-18*mm, 16*mm)
    canvas.setFillColor(muted)
    canvas.setFont('Helvetica', 8)
    canvas.drawString(18*mm, 10.5*mm, 'Family Hub  |  Lista de compras')
    canvas.drawRightString(PAGE_W-18*mm, 10.5*mm, f'Página {doc.page}')
    canvas.restoreState()

doc = ChecklistDocTemplate(OUT, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=17*mm, bottomMargin=22*mm)
styles = getSampleStyleSheet()
title = ParagraphStyle('Title', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, leading=26, textColor=navy, spaceAfter=4)
sub = ParagraphStyle('Sub', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=14, textColor=muted)
section = ParagraphStyle('Section', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11, leading=14, textColor=navy, spaceBefore=2, spaceAfter=7)
section_white = ParagraphStyle('SectionWhite', parent=section, textColor=colors.white, spaceBefore=0, spaceAfter=0)
item = ParagraphStyle('Item', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=ink)
small = ParagraphStyle('Small', parent=styles['Normal'], fontName='Helvetica', fontSize=9, leading=12, textColor=muted)

story = []
story.append(Paragraph('Lista de compras', title))
story.append(Paragraph('Coisas para casa', ParagraphStyle('Cat', parent=sub, fontSize=12, textColor=blue, leading=15)))
story.append(Spacer(1, 3*mm))
meta = Table([[Paragraph('<b>Família Amado</b>', small), Paragraph('25/10/2026', small)]], colWidths=[116*mm, 58*mm])
meta.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),light_blue),('BOX',(0,0),(-1,-1),0.6,line),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
story.append(meta)
story.append(Spacer(1, 10*mm))
story.append(Paragraph('Itens para comprar', section))
row = Table([[Paragraph('[ ]', ParagraphStyle('Box', parent=item, fontSize=15, textColor=blue, leading=18)), Paragraph('Saco de lixo', item), Paragraph('1 un', small)]], colWidths=[15*mm, 129*mm, 30*mm])
row.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.white),('BOX',(0,0),(-1,-1),0.7,line),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12)]))
story.append(row)
story.append(Spacer(1, 10*mm))
story.append(Paragraph('Observações', section))
notes = Table([[''],[''],[''],['']], colWidths=[174*mm], rowHeights=[10*mm,10*mm,10*mm,10*mm])
notes.setStyle(TableStyle([('LINEBELOW',(0,0),(-1,-1),0.5,line),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0)]))
story.append(notes)

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
