import sys
import fitz

def read_pdf(file_path):
    doc = fitz.open(file_path)
    text = ""
    for i in range(min(15, len(doc))): # read first 15 pages to find the curriculum data
        page = doc.load_page(i)
        text += page.get_text()
    print(text)

if __name__ == "__main__":
    read_pdf(sys.argv[1])
