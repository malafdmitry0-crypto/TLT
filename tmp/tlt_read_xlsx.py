import json
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def text_of(si):
    return "".join(node.text or "" for node in si.findall(".//m:t", NS))


def main(path):
    with zipfile.ZipFile(path) as archive:
        shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = [text_of(si) for si in shared_root.findall("m:si", NS)]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
    cells = []
    for cell in sheet.findall(".//m:sheetData/m:row/m:c", NS):
        ref = cell.attrib["r"]
        cell_type = cell.attrib.get("t")
        formula_node = cell.find("m:f", NS)
        value_node = cell.find("m:v", NS)
        formula = formula_node.text if formula_node is not None else None
        raw = value_node.text if value_node is not None else None
        value = raw
        if cell_type == "s" and raw is not None:
            value = shared[int(raw)]
        elif cell_type == "inlineStr":
            value = "".join(node.text or "" for node in cell.findall(".//m:t", NS))
        if value not in (None, "") or formula:
            cells.append({"cell": ref, "value": value, "formula": formula,
                          "style": cell.attrib.get("s"), "type": cell_type})
    for item in cells:
        print(json.dumps(item, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
