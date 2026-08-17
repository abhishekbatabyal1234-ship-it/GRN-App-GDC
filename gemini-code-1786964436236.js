const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Pulls Gemini API key securely from Vercel Environment Variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());

// API Endpoint for AI Scan
app.post('/api/scan-invoice', upload.single('invoice_image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided." });

    const imageParts = [{
      inlineData: {
        data: req.file.buffer.toString("base64"),
        mimeType: req.file.mimetype
      },
    }];

    const prompt = `
      Extract details from this catering vendor invoice and return ONLY a valid JSON object.
      Do not include markdown backticks like \`\`\`json.
      
      JSON Structure:
      {
        "vendor_name": "String",
        "bill_date": "YYYY-MM-DD",
        "items": [
          { "item_name": "String", "qty_billed": Number }
        ]
      }
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text().trim();
    
    const parsedData = JSON.parse(responseText.replace(/```json|```/g, ""));
    const today = new Date().toISOString().split('T')[0];

    return res.json({
      vendor_name: parsedData.vendor_name || "Unknown Vendor",
      bill_date: parsedData.bill_date || today,
      grn_date: today,
      items: (parsedData.items || []).map(item => ({
        item_name: item.item_name,
        qty_billed: item.qty_billed || 0,
        qty_received: item.qty_billed || 0,
        remarks: "OK"
      }))
    });

  } catch (error) {
    console.error("Scan Error:", error);
    return res.status(500).json({ error: "Failed to parse invoice." });
  }
});

// Serve Mobile Web App Interface
app.get('*', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Catering Store GRN Generator</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js"></script>
    </head>
    <body class="bg-gray-100 p-4 min-h-screen">
      <div class="max-w-md mx-auto bg-white rounded-xl shadow-md p-6">
        <h2 class="text-xl font-bold text-gray-800 mb-4">Store GRN Generator</h2>

        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Capture Vendor Invoice</label>
          <input type="file" id="invoiceInput" accept="image/*" capture="environment" 
                 class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white"/>
        </div>

        <button onclick="uploadAndParse()" id="scanBtn" class="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700">
          Scan Invoice with AI
        </button>

        <div id="grnForm" class="hidden mt-6">
          <hr class="my-4">
          <h3 class="text-lg font-bold text-gray-800 mb-2">Goods Received Note</h3>
          <div class="space-y-3">
            <div>
              <label class="text-xs font-semibold text-gray-500">Vendor Name</label>
              <input type="text" id="vendorName" class="w-full border p-2 rounded-lg text-sm">
            </div>
            <div class="flex gap-2">
              <div class="w-1/2">
                <label class="text-xs font-semibold text-gray-500">Bill Date</label>
                <input type="date" id="billDate" class="w-full border p-2 rounded-lg text-sm">
              </div>
              <div class="w-1/2">
                <label class="text-xs font-semibold text-gray-500">GRN Date</label>
                <input type="date" id="grnDate" class="w-full border p-2 rounded-lg text-sm">
              </div>
            </div>

            <h4 class="font-semibold text-sm text-gray-700 mt-4">Line Items</h4>
            <div id="itemsContainer" class="space-y-3"></div>

            <button onclick="exportGRNPdf()" class="w-full bg-green-600 text-white py-3 rounded-lg font-bold mt-4">
              Download / Print GRN PDF
            </button>
          </div>
        </div>
      </div>

      <script>
        let grnData = null;

        async function uploadAndParse() {
          const fileInput = document.getElementById('invoiceInput');
          if (!fileInput.files[0]) return alert('Please capture or select an invoice image.');

          document.getElementById('scanBtn').innerText = 'Processing with Gemini AI...';
          const formData = new FormData();
          formData.append('invoice_image', fileInput.files[0]);

          try {
            const response = await fetch('/api/scan-invoice', { method: 'POST', body: formData });
            grnData = await response.json();
            renderForm(grnData);
          } catch (err) {
            alert('Failed to process image. Check your API Key.');
          } finally {
            document.getElementById('scanBtn').innerText = 'Scan Invoice with AI';
          }
        }

        function renderForm(data) {
          document.getElementById('grnForm').classList.remove('hidden');
          document.getElementById('vendorName').value = data.vendor_name;
          document.getElementById('billDate').value = data.bill_date;
          document.getElementById('grnDate').value = data.grn_date;

          const container = document.getElementById('itemsContainer');
          container.innerHTML = '';

          data.items.forEach((item, index) => {
            container.innerHTML += \`
              <div class="border p-3 rounded-lg bg-gray-50 text-xs space-y-2">
                <input type="text" value="\${item.item_name}" id="name_\${index}" class="w-full border p-1 rounded font-semibold">
                <div class="flex gap-2">
                  <div class="w-1/2">
                    <label>Qty Billed</label>
                    <input type="number" value="\${item.qty_billed}" id="billed_\${index}" class="w-full border p-1 rounded">
                  </div>
                  <div class="w-1/2">
                    <label class="text-blue-600 font-bold">Qty Received</label>
                    <input type="number" value="\${item.qty_received}" id="received_\${index}" class="w-full border p-1 rounded bg-white font-bold">
                  </div>
                </div>
                <div>
                  <label>Remarks</label>
                  <input type="text" value="\${item.remarks}" id="remarks_\${index}" class="w-full border p-1 rounded">
                </div>
              </div>
            \`;
          });
        }

        function exportGRNPdf() {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          doc.setFontSize(16);
          doc.text("GOODS RECEIVED NOTE (GRN)", 14, 20);
          doc.setFontSize(10);
          doc.text(\`Vendor Name: \${document.getElementById('vendorName').value}\`, 14, 30);
          doc.text(\`Bill Date: \${document.getElementById('billDate').value}\`, 14, 36);
          doc.text(\`GRN Date: \${document.getElementById('grnDate').value}\`, 14, 42);

          const tableData = grnData.items.map((_, i) => [
            document.getElementById(\`name_\${i}\`).value,
            document.getElementById(\`billed_\${i}\`).value,
            document.getElementById(\`received_\${i}\`).value,
            document.getElementById(\`remarks_\${i}\`).value,
          ]);

          doc.autoTable({
            startY: 48,
            head: [['Item Name', 'Qty Billed', 'Qty Received', 'Remarks']],
            body: tableData,
          });

          doc.save(\`GRN_\${document.getElementById('grnDate').value}.pdf\`);
        }
      </script>
    </body>
    </html>
  `);
});

module.exports = app;