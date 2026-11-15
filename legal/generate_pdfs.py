#!/usr/bin/env python3
"""
软著材料 PDF 生成脚本
- 源代码：每页精确 50 行 + 页眉 + 页码（LibreOffice 转 PDF）
- 说明书/隐私政策/材料清单/申请表指南：pandoc 直接转 PDF
"""
import os, sys, subprocess, json, shutil

LEGAL_DIR = "/workspace/legal"
OUT_DIR = "/workspace/legal/pdf"
os.makedirs(OUT_DIR, exist_ok=True)

PROFILE = json.load(open("/workspace/.user-profile.json"))

# ====================== 1. 源代码排版 ======================

def build_source_html():
    """把软著-源代码.txt 排版成每页 50 行 + 页眉的 HTML"""
    with open(f"{LEGAL_DIR}/软著-源代码.txt", "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 版权中心要求：前 30 页 + 后 30 页，不足 60 页全部提交
    # 这里全部提交（51 页 < 60，直接全交）
    TOTAL_LINES = len(lines)
    LINES_PER_PAGE = 50
    pages = []
    for i in range(0, TOTAL_LINES, LINES_PER_PAGE):
        page_lines = lines[i:i+LINES_PER_PAGE]
        # 补齐到 50 行（末页不足时用空行）
        while len(page_lines) < LINES_PER_PAGE:
            page_lines.append("\n")
        pages.append("".join(page_lines))

    TOTAL_PAGES = len(pages)
    HEADER_TEXT = "闪闪发光 APP V1.0  源代码"
    FOOTER_TEMPLATE = "第 __PAGE__ 页 / 共 __TOTAL__ 页"

    html_parts = [f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>{HEADER_TEXT}</title>
<style>
@page {{ size: A4; margin: 22mm 18mm 22mm 18mm; }}
* {{ box-sizing: border-box; }}
.page {{
    page-break-after: always;
    width: 174mm;
    min-height: 252mm;
    display: flex;
    flex-direction: column;
    padding-top: 4mm;
}}
.page:last-child {{ page-break-after: auto; }}
.header {{
    font-family: "Noto Sans CJK SC", "WenQuanYi Micro Hei", "SimSun", serif;
    font-size: 8.5pt;
    color: #555;
    text-align: center;
    border-bottom: 0.5pt solid #999;
    padding-bottom: 1.5mm;
    margin-bottom: 3mm;
    letter-spacing: 0.4mm;
}}
.code {{
    font-family: "DejaVu Sans Mono", "Consolas", "Courier New", monospace;
    font-size: 8pt;
    line-height: 5mm;           /* 50 行 × 5mm = 250mm 内容区 */
    letter-spacing: 0.1mm;
    white-space: pre;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow: hidden;
}}
.footer {{
    font-family: "Noto Sans CJK SC", "WenQuanYi Micro Hei", serif;
    font-size: 8pt;
    color: #777;
    text-align: center;
    padding-top: 2mm;
    border-top: 0.3pt solid #bbb;
    margin-top: 2mm;
}}
</style></head><body>"""]

    for idx, page_content in enumerate(pages):
        page_num = idx + 1
        footer = FOOTER_TEMPLATE.replace("__PAGE__", str(page_num)).replace("__TOTAL__", str(TOTAL_PAGES))
        html_parts.append(f"""
<div class="page">
    <div class="header">{HEADER_TEXT}  ·  康银成  ·  软著申请用</div>
    <pre class="code">{page_content}</pre>
    <div class="footer">{footer}</div>
</div>""")

    html_parts.append("</body></html>")
    html_path = f"{OUT_DIR}/软著-源代码.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html_parts))
    print(f"  HTML 生成：{html_path} ({len(pages)} 页, {TOTAL_LINES} 行)")
    return html_path

# ====================== 2. 其他材料 pandoc 转 PDF ======================

PANDOC_PAGESIZE = "--pdf-engine=xelatex" if shutil.which("xelatex") else "--pdf-engine=wkhtmltopdf"

def pandoc_to_pdf(md_file, pdf_name, title):
    """用 pandoc 把 md 转 PDF，带页眉页脚"""
    input_path = f"{LEGAL_DIR}/{md_file}"
    output_path = f"{OUT_DIR}/{pdf_name}"

    # 构建 YAML header 注入 md（pandoc 识别）
    yaml_header = f"""---
title: "{title}"
author: "康银成"
date: "2026-11-15"
geometry: margin=2.2cm 1.8cm
fontsize: 11pt
header-includes:
  - \\usepackage{{fancyhdr}}
  - \\pagestyle{{fancy}}
  - \\fancyhead[C]{{{title} — 康银成}}
  - \\fancyfoot[C]{{第 \\thepage\\ 页 / 共 \\pageref{{LastPage}}\\ 页}}
  - \\usepackage{{lastpage}}
  - \\usepackage{{zhfontspec}}
  - \\setmainfont{{Noto Sans CJK SC}}
...

"""
    with open(input_path, "r", encoding="utf-8") as f:
        body = f.read()

    temp_md = f"{OUT_DIR}/_temp.md"
    with open(temp_md, "w", encoding="utf-8") as f:
        f.write(yaml_header + body)

    cmd = [
        "pandoc", temp_md,
        "-o", output_path,
        "--pdf-engine=xelatex",
        "-V", "CJKmainfont=Noto Sans CJK SC",
        "-V", "mainfont=Noto Sans CJK SC",
        "-V", "geometry:margin=2.2cm 1.8cm",
    ]
    print(f"  pandoc → {pdf_name} ...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    ⚠ pandoc 失败，尝试 wkhtmltopdf 或 LibreOffice 路线")
        print(f"    stderr: {result.stderr[:300]}")
        return False
    os.remove(temp_md)
    return True

# ====================== 3. LibreOffice HTML→PDF 兜底 ======================

def libreoffice_html_to_pdf(html_path, pdf_path):
    """LibreOffice headless 转 PDF（备用方案）"""
    cmd = [
        "libreoffice", "--headless", "--convert-to", "pdf",
        "--outdir", os.path.dirname(pdf_path), html_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    # LibreOffice 输出名和 html 同名，改成目标名
    generated = html_path.replace(".html", ".pdf")
    if os.path.exists(generated):
        if generated != pdf_path:
            shutil.move(generated, pdf_path)
        return True
    print(f"    ⚠ LibreOffice 转换未找到输出: {generated}")
    return False

# ====================== 主流程 ======================

if __name__ == "__main__":
    print("=" * 60)
    print("📄 法律材料 PDF 自动生成")
    print(f"   著作权人：{PROFILE['real_name']}")
    print(f"   输出目录：{OUT_DIR}")
    print("=" * 60)

    # --- 源代码 ---
    print("\n[1/5] 源代码排版（每页 50 行 + 页眉 + 页码）")
    html = build_source_html()
    pdf_src = f"{OUT_DIR}/软著-源代码.pdf"
    # 优先 xelatex 直接转（pandoc 也行，但 LibreOffice 对中文更稳）
    if shutil.which("xelatex"):
        print("  检测到 xelatex，走 pandoc + xelatex 路线 ...")
        # 把 HTML 喂给 pandoc
        subprocess.run(["pandoc", html, "-o", pdf_src, "--pdf-engine=xelatex",
                        "-V", "CJKmainfont=Noto Sans CJK SC",
                        "-V", "geometry:margin=2.2cm 1.8cm"], capture_output=True)
    else:
        print("  走 LibreOffice headless 路线 ...")
        libreoffice_html_to_pdf(html, pdf_src)
    if os.path.exists(pdf_src):
        print(f"  ✓ 源代码 PDF：{pdf_src}")
    else:
        print(f"  ✗ 源代码 PDF 生成失败")

    # --- 其他 4 份 ---
    jobs = [
        ("软著-软件说明书.md",      "软著-软件说明书.pdf",      "闪闪发光 APP 软件说明书"),
        ("APP备案-隐私政策.md",     "APP备案-隐私政策.pdf",     "闪闪发光 APP 隐私政策"),
        ("APP备案-材料清单.md",     "APP备案-材料清单.pdf",     "闪闪发光 APP 备案材料清单"),
        ("软著-申请表填写指南.md",  "软著-申请表填写指南.pdf",  "软著登记申请表填写指南"),
    ]
    print("\n[2-5/5] pandoc 转换说明书/隐私政策/清单/指南")
    for md, pdf, title in jobs:
        ok = pandoc_to_pdf(md, pdf, title)
        if not ok:
            # 兜底：LibreOffice
            print(f"    用 LibreOffice 兜底 ...")
            # 先 pandoc 转 html
            html_tmp = f"{OUT_DIR}/{pdf.replace('.pdf', '.html')}"
            subprocess.run(["pandoc", f"{LEGAL_DIR}/{md}", "-o", html_tmp,
                            "-V", "CJKmainfont=Noto Sans CJK SC"], capture_output=True)
            libreoffice_html_to_pdf(html_tmp, f"{OUT_DIR}/{pdf}")
            if os.path.exists(html_tmp):
                os.remove(html_tmp)
        if os.path.exists(f"{OUT_DIR}/{pdf}"):
            print(f"  ✓ {pdf}")
        else:
            print(f"  ✗ {pdf} 生成失败")

    # --- 汇总 ---
    print("\n" + "=" * 60)
    print("✅ 生成结果汇总")
    print("=" * 60)
    for f in sorted(os.listdir(OUT_DIR)):
        if f.endswith(".pdf"):
            size = os.path.getsize(f"{OUT_DIR}/{f}")
            print(f"  📄 {f:40s} {size/1024:.0f} KB")
    total = sum(os.path.getsize(f"{OUT_DIR}/{f}") for f in os.listdir(OUT_DIR) if f.endswith(".pdf"))
    print(f"\n  PDF 共 {len([f for f in os.listdir(OUT_DIR) if f.endswith('.pdf')])} 个，合计 {total/1024:.0f} KB")
    print(f"  位置：{OUT_DIR}/")
