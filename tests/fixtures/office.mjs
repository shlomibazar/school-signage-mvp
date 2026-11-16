// Clipboard HTML in the shape Microsoft Office puts on the clipboard (text/html), written by hand
// after real Excel/Word output (conditional comments, mso-* styles, class rules in <style>, x:num
// attributes, o:p elements, Symbol list markers). These are fixtures, not captured clipboards: real
// Office paste still needs a manual check (see the report).

export const EXCEL_TABLE = `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta name=ProgId content=Excel.Sheet><meta name=Generator content="Microsoft Excel 15">
<style><!--table {mso-displayed-decimal-separator:"\\.";}
.xl65 {color:white;font-size:11.0pt;font-weight:700;text-align:center;background:#1F4E78;border:.5pt solid windowtext;mso-pattern:black none;}
.xl66 {color:windowtext;font-size:11.0pt;background:#DDEBF7;border:.5pt solid windowtext;mso-number-format:"Short Date";}
.xl67 {font-size:11.0pt;background:#FFF2CC;border:.5pt solid windowtext;mso-number-format:0%;}
.xl68 {color:#9C0006;font-size:11.0pt;background:#FFC7CE;border:.5pt solid windowtext;}
.xl69 {font-size:11.0pt;border:.5pt solid windowtext;text-align:left;}
--></style></head><body link="#0563C1" vlink="#954F72">
<table border=0 cellpadding=0 cellspacing=0 width=520 style='border-collapse:collapse;width:390pt'>
<!--StartFragment-->
 <col width=130 span=4 style='width:98pt'>
 <tr height=20><td colspan=4 height=20 class=xl65 width=520>לוח מבחנים – שכבה י׳ (Term A)</td></tr>
 <tr height=20><td class=xl65>תאריך</td><td class=xl65>מקצוע</td><td class=xl65>אחוז הצלחה</td><td class=xl65>Notes</td></tr>
 <tr height=20><td class=xl66 rowspan=2 x:num="46338">12/11/2026</td><td class=xl66>מתמטיקה 5 יח״ל</td><td class=xl67 x:num="0.87" x:fmla="=B3/C3">87%</td><td class=xl69>Room 214</td></tr>
 <tr height=20><td class=xl66>English</td><td class=xl67 x:num="0.9">90%</td><td class=xl69></td></tr>
 <tr height=20><td class=xl68>14/11/2026</td><td class=xl68>היסטוריה</td><td class=xl68 x:num="1.5">1,234.50</td><td class=xl68>נדחה – בגלל טיול</td></tr>
<!--EndFragment-->
</table></body></html>`

export const WORD_DOCUMENT = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta name=Generator content="Microsoft Word 15"><style><!--
p.MsoNormal {margin:0cm;text-align:right;direction:rtl;unicode-bidi:embed;font-size:12.0pt;font-family:"Arial",sans-serif;}
h1 {mso-style-link:"Heading 1 Char";font-size:16.0pt;color:#2F5496;}
--></style><!--[if gte mso 9]><xml><w:WordDocument><w:View>Normal</w:View></w:WordDocument></xml><![endif]--></head>
<body lang=EN-US dir=RTL><!--StartFragment-->
<h1 dir=RTL><span lang=HE>ערב הורים – מחצית א׳</span></h1>
<p class=MsoNormal dir=RTL align=right style='text-align:left;direction:rtl'><b><span lang=HE dir=LTR style='color:#C00000'>חשוב:</span></b><span lang=HE dir=LTR> ההרשמה דרך <a href="https://example.org/register">אתר בית הספר</a> עד 10/11, בשעה 18:00, ב-Zoom ובאולם.</span><o:p></o:p></p>
<p class=MsoNormal dir=LTR style='text-align:left;direction:ltr'><i>Parents who cannot attend</i> may <u>email the office</u>.</p>
<p class=MsoListParagraphCxSpFirst dir=RTL style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-list:Ignore'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]><span lang=HE>להביא את מחברת הקשר</span></p>
<p class=MsoListParagraphCxSpLast dir=RTL style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol;mso-list:Ignore'>·<span>&nbsp;&nbsp; </span></span><![endif]><span lang=HE>חניה <b><i>בחניון הצפוני</i></b> בלבד</span></p>
<p class=MsoListParagraphCxSpFirst dir=RTL style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span><![endif]>שכבה ז׳ – 17:00</p>
<p class=MsoListParagraphCxSpLast dir=RTL style='mso-list:l1 level1 lfo2'><![if !supportLists]><span style='mso-list:Ignore'>2.<span>&nbsp;</span></span><![endif]>שכבה ח׳ – 18:30</p>
<table class=MsoTableGrid dir=rtl border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
 <tr><td width=200 valign=top style='border:solid windowtext 1.0pt;background:#D9E2F3;padding:0cm 5.4pt'><p class=MsoNormal dir=RTL><b>שכבה</b></p></td><td style='border:solid windowtext 1.0pt;background:#D9E2F3'><p class=MsoNormal dir=RTL><b>מיקום</b></p></td></tr>
 <tr><td style='border:solid windowtext 1.0pt'><p class=MsoNormal dir=RTL>ז׳</p></td><td style='border:solid windowtext 1.0pt'><p class=MsoNormal dir=RTL>אולם מרכזי</p></td></tr>
</table>
<!--EndFragment--></body></html>`

/** Hostile or broken markup that must come out inert. */
export const MALICIOUS = [
  '<p onclick="alert(1)">a</p><img src=x onerror=alert(2)><script>alert(3)</script>',
  '<p style="background:url(javascript:alert(4));color:red;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999">b</p>',
  '<p style="color:expression(alert(5))">c</p><a href="javascript:alert(6)">link</a><iframe src="https://evil.example"></iframe>',
  '<table><tr><td>unclosed<td colspan="999999" rowspan="-3" style="border:1px solid url(https://x/y.png)">d</table>',
  '<svg onload=alert(7)><circle/></svg><math><mi xlink:href="javascript:alert(8)">e</mi></math><p>ok</p>',
  '<style>body{display:none}</style><link rel=stylesheet href=https://evil.example/x.css><p>f</p>',
  '<p>"><img src=x onerror=alert(9)>&lt;script&gt;</p><div style="font-size:9999px;font-family:x\\" onclick=y">g</div>',
]
