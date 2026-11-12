import { jsPDF } from "jspdf";
import dmsLifecycleService from '../../services/DMSLifecycleService';
import { sanitizePrintableHtml } from './sanitize';

export type ManualDetails = {
    categoryName: string;
    manualCode: string;
    manualNo: string;
    manualName: string;
    version: string;
    statusString: string;
};


export async function generateHTMLContent(manualText: string, dmManualVersionID: number): Promise<{ htmlContent: string, manualName: string }> {
    const logoBase64 = 'data:image/png;base64,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'; // Replace with actual base64 string
    
    let manualData: ManualDetails;
    try {
        manualData = await dmsLifecycleService.getApiCall(`Manuals/GetManualDetailsByVersionId/${dmManualVersionID}`);
    } catch {
        manualData = {
            categoryName: '',
            manualCode: '',
            manualNo: '',
            manualName: '',
            version: '',
            statusString: ''
        };
    }

    const headerText = manualData?.manualNo + ' - ' + manualData?.manualName ;
    const htmlContent = `
      <html>
        <head>
          <style>
            /* Set default zoom for Word */
            @page {
              mso-zoom-percent: 80;
            }
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              font-size: 12px; /* Reduce base font size */
            }
            h1 {  
              color: #4CAF50;
              align: center;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              padding: 8px;
              text-align: left;
              border: 1px solid #000;
            }
            .header-table td {
              vertical-align: middle;
            }
            .header-table {
              margin-bottom: 20px;
            }
            .watermark {
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-45deg);
              font-size: 80px;
              color: rgba(200, 200, 200, 0.3);
              z-index: -1;
              pointer-events: none;
              font-weight: bold;
              white-space: nowrap;
            }
          </style>
        </head>
        <body>
          <div class="watermark">CONFIDENTIAL</div>
          <table class="header-table" style="width:100%;height:140px;border-collapse: collapse;">
            <tr>
              <td style="width:10%; text-align:center;">
                 <img src="${logoBase64}" alt="Company Logo" width="80">
              </td>
              <td style="width:50%; text-align:center;">
                <div style="border-bottom:1px solid #000;"><h2>Fleet Maintenance Manual</h2></div>
                <div><h3>${headerText}</h3></div>
              </td>
              <td style="width:40%; text-align:left;">
                <table style="width:100%;">
                  <tr style="border-bottom: 1px solid #000;">
                    <td style="border: none;"><strong>DOCUMENT ID</strong></td>
                    <td style="border: none;">FMM</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000;">
                    <td style="border: none;"><strong>ISSUED BY</strong></td>
                    <td style="border: none;">DPA</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #000;">
                    <td style="border: none;"><strong>SECTION</strong></td>
                    <td style="border: none;">${manualData?.manualNo}</td>
                  </tr>
                  <tr>
                    <td style="border: none;"><strong>REV. NO.</strong></td>
                    <td style="border: none;">${manualData?.version}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <div><br></div>
          <div>${manualText}</div>
        </body>
      </html> 
    `;

   return { htmlContent, manualName: headerText|| 'manual' };
}

export async function downloadAsWord(manualText: string, dmManualVersionID: number) {
    
    const { htmlContent, manualName } = await generateHTMLContent(manualText, dmManualVersionID);

    // Create a Blob object with the HTML content
    const blob = new Blob(["\ufeff", htmlContent], {
        type: "application/msword",
    });

    // Create a download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${manualName}.doc`; // File name for the Word document

    // Trigger the download
    document.body.appendChild(link);
    link.click();

    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function downloadAsPDF(manualText: string, dmManualVersionID: number) {
    const { htmlContent, manualName } = await generateHTMLContent(manualText, dmManualVersionID);

    const doc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4"
    });

    // Create a temporary element to render the HTML
    // The page is put into this document for jsPDF to lay out, so nothing in it may run code.
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizePrintableHtml(htmlContent);
    document.body.appendChild(tempDiv);

    doc.html(tempDiv, {
        callback: function (doc) {
            // Add watermark to all pages
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(60);
                doc.setTextColor(100, 100, 100);
                doc.saveGraphicsState();
                
                // Center the watermark and rotate it
                const pageWidth = doc.internal.pageSize.getWidth()+150;
                const pageHeight = doc.internal.pageSize.getHeight()+150;
                
                doc.text('Downloaded Copy', pageWidth / 2, pageHeight / 2, {
                    align: 'center',
                    angle: 45,
                    renderingMode: 'stroke'
                });
                
                doc.restoreGraphicsState();
            }
            doc.save(`${manualName || 'manual'}.pdf`);
            document.body.removeChild(tempDiv); // Clean up
        },
        x: 20,
        y: 20,
        width: 555, // a4 width minus margins (595 - 2*20)
        windowWidth: 800 // helps with scaling
    });
  }