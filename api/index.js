const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const app = express();

app.use(express.json({ limit: '10mb' }));

// Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'GRN API is active' });
});

// Root Web Interface
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GRN Generator - GDC</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
        h1 { font-size: 1.5rem; text-align: center; color: #38bdf8; margin-bottom: 20px; }
        .upload-box { border: 2px dashed #475569; padding: 30px; text-align: center; border-radius: 8px; cursor: pointer; background: #0f172a; }
        input[type="file"] { display: none; }
        button { width: 100%; margin-top: 20px; padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 1rem; }
        button:hover { background: #0369a1; }
        #output { margin-top: 20px; white-space: pre-wrap; background: #0f172a; padding: 16px; border-radius: 6px; border: 1px solid #334155; display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Goods Receipt Note (GRN) App</h1>
        <div class="upload-box" onclick="document.getElementById('fileInput').click()">
          <span id="fileName">Tap to upload or take a photo of invoice</span>
          <input type="file" id="fileInput" accept="image/*" capture="environment" onchange="handleFileSelect(event)">
        </div>
        <button onclick="processInvoice()">Generate GRN</button>
        <div id="output"></div>
      </div>

      <script>
        let selectedBase64 = '';
        let selectedMimeType = '';

        function handleFileSelect(e) {
          const file = e.target.files[0];
          if (!file) return;
          document.getElementById('fileName').innerText = file.name;
          const reader = new FileReader();
          reader.onload = function(evt) {
            const dataUrl = evt.target.result;
            selectedMimeType = file.type;
            selectedBase64 = dataUrl.split(',')[1];
          };
          reader.readAsDataURL(file);
        }

        async function processInvoice() {
          const out = document.getElementById('output');
          if (!selectedBase64) {
            alert('Please select an image first.');
            return;
          }
          out.style.display = 'block';
          out.innerText = 'Analyzing invoice via Gemini AI...';

          try {
            const res = await fetch('/api/process-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: selectedBase64, mimeType: selectedMimeType })
            });
            const data = await res.json();
            out.innerText = JSON.stringify(data, null, 2);
          } catch (err) {
            out.innerText = 'Error processing request: ' + err.message;
          }
        }
      </script>
    </body>
    </html>
  `);
});

// Gemini OCR Processing Endpoint
app.post('/api/process-invoice', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured in Vercel Environment Variables.' });
    }

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg'
          }
        },
        "Extract the items from this vendor invoice for a Goods Receipt Note (GRN). Return JSON with fields: vendor_name, invoice_number, invoice_date, and items array (containing item_description, quantity, rate, total_amount)."
      ]
    });

    res.status(200).json({
      success: true,
      data: response.text
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = app;
