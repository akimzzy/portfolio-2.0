"""Create the public resume from confirmed portfolio data. Requires reportlab."""
import json
import shutil
from html import escape
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/fonts'
pdfmetrics.registerFont(TTFont('Resume', str(FONT_DIR / 'Ubuntu-R.ttf')))
pdfmetrics.registerFont(TTFont('ResumeBold', str(FONT_DIR / 'Ubuntu-B.ttf')))
data = json.loads((ROOT / 'tmp/pdfs/resume-data.json').read_text())
ink = colors.HexColor('#292d25')
muted = colors.HexColor('#62685d')
blue = colors.HexColor('#355f9c')
styles = {
    'name': ParagraphStyle('name', fontName='ResumeBold', fontSize=25, leading=30, textColor=ink, spaceAfter=5),
    'heading': ParagraphStyle('heading', fontName='ResumeBold', fontSize=13, leading=18, textColor=ink, spaceBefore=16, spaceAfter=9, keepWithNext=True),
    'title': ParagraphStyle('title', fontName='ResumeBold', fontSize=11, leading=15, textColor=ink),
    'body': ParagraphStyle('body', fontName='Resume', fontSize=10, leading=14.5, textColor=ink, spaceAfter=6),
    'small': ParagraphStyle('small', fontName='Resume', fontSize=9, leading=13, textColor=muted, spaceAfter=5),
    'date': ParagraphStyle('date', fontName='Resume', fontSize=9, leading=15, textColor=muted, alignment=TA_RIGHT),
}

def clean(text):
    return text.replace('–', '-').replace('—', ' - ').replace('→', 'to').replace('·', '|')

def p(text, style='body'):
    return Paragraph(escape(clean(text)), styles[style])

def linked(label, url):
    return f'<a href="{escape(url, quote=True)}" color="#355f9c">{escape(label)}</a>'

story = [p(data['profile']['name'], 'name'), p(data['profile']['role'], 'body')]
story.append(Paragraph(' | '.join([
    linked(data['profile']['email'], 'mailto:' + data['profile']['email']),
    linked('GitHub: akimzzy', data['profile']['github']),
    linked('LinkedIn: Akeem Adeyemi', data['profile']['linkedin']),
]), styles['small']))
story.extend([Spacer(1, 8), p(data['profile']['about']), p('Professional experience', 'heading')])
for role in data['experience']:
    row = Table([[p(role['title'], 'title'), p(role['period'], 'date')]], colWidths=[338, A4[0] - 96 - 338])
    row.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
    block = [row, p(role['subtitle'], 'small')]
    for paragraph in role['description'].split('\n\n'):
        block.append(p(paragraph))
    block.append(Spacer(1, 9))
    story.append(KeepTogether(block))

story.extend([PageBreak(), p('Akeem Adeyemi | Selected work', 'title'), p('Selected product work', 'heading')])
for project in data['projects']:
    block = [p(project['title'], 'title'), p(project['subtitle'], 'small'), p(project['summary'])]
    block.append(p(' | '.join(project['tags']), 'small'))
    if project.get('live'):
        label = 'Company profile' if 'linkedin.com' in project['live'] else project['live'].replace('https://', '').rstrip('/')
        block.append(Paragraph(linked(label, project['live']), styles['small']))
    for link in project.get('additionalLinks', []):
        block.append(Paragraph(linked(link['label'] + ': ' + link['href'].replace('https://', '').rstrip('/'), link['href']), styles['small']))
    block.append(Spacer(1, 7))
    story.append(KeepTogether(block))
story.append(p('Tools & skills', 'heading'))
for skill in data['skills']:
    story.append(Paragraph(f'<font name="ResumeBold">{escape(skill["category"])}</font> - {escape(skill["items"])}', styles['small']))
story.extend([p('Education', 'heading'), p(' | '.join([data['education']['qualification'], data['education']['institution'], data['education']['year']]))])

output = ROOT / 'output/pdf/akeem-adeyemi-resume.pdf'
output.parent.mkdir(parents=True, exist_ok=True)

def footer(canvas, doc):
    canvas.setFont('Resume', 8)
    canvas.setFillColor(muted)
    canvas.drawString(48, 28, 'Akeem Adeyemi | Senior full-stack engineer')
    canvas.drawRightString(A4[0] - 48, 28, str(doc.page))

doc = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=48, rightMargin=48, topMargin=42, bottomMargin=46, title='Akeem Adeyemi - Resume', author='Akeem Adeyemi')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
shutil.copyfile(output, ROOT / 'public/akeem-adeyemi-resume.pdf')
print(output)
