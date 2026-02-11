/**
 * Netlify Function: RainViewer Proxy
 *
 * Diese Funktion proxied RainViewer Tile-Anfragen und löst CORS-Probleme
 * Usage: /.netlify/functions/rainviewer-proxy?z=9&x=268&y=172&timestamp=0
 */

exports.handler = async (event) => {
  try {
    // Query-Parameter extrahieren
    const { z, x, y, timestamp = "0" } = event.queryStringParameters || {};

    // Validierung
    if (!z || !x || !y) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing parameters: z, x, y required" }),
      };
    }

    // RainViewer API URL zusammenstellen
    // Format: https://tilecache.rainviewer.com/v2/radar/{timestamp}/{z}/{x}/{y}/2/1_1.png
    const rainviewerUrl = `https://tilecache.rainviewer.com/v2/radar/${timestamp}/${z}/${x}/${y}/2/1_1.png`;

    console.log(`Proxying RainViewer tile: ${rainviewerUrl}`);

    // Tile von RainViewer abrufen
    const response = await fetch(rainviewerUrl);

    // Wenn nicht OK, Error zurückgeben
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `RainViewer API returned ${response.status}` }),
      };
    }

    // Tile als Buffer abrufen
    const buffer = await response.buffer();
    const base64 = buffer.toString("base64");

    // Mit CORS Headers zurückgeben
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600", // 1 Stunde cachen
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      isBase64Encoded: true,
      body: base64,
    };
  } catch (error) {
    console.error("RainViewer Proxy Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

