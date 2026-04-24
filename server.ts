import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  app.post("/api/analyze-sos", async (req, res) => {
    try {
      const { data } = req.body;
      const prompt = `
You are an advanced AI Emergency Detection System. Review the following incoming sensor data from a user's mobile device and determine whether an emergency (SOS) should be triggered.

For demo purposes, the voice sensor is unreliable right now so please IGNORE the voice parameters. Evaluate the risk using ONLY the Motion and Interaction/Behavior data. Even slight elevated motion or erratic behavior should trigger the SOS with a confidence score > 15.

Data Context:
- Active Sensors: Voice: ${data.activeSensors.voice}, Motion: ${data.activeSensors.motion}, Context(GPS): ${data.activeSensors.context}
- Motion Accel (G - ~9.8 is resting gravity): ${data.motionAccel}
- Speed (km/h): ${data.speedKmH}
- Interaction Rate (touches/min): ${data.interactionRate}
- Connected Mesh Nodes nearby: ${data.connectedMeshNodes}

Respond ONLY with a JSON object. No markdown wrapping.
{
  "triggerSOS": boolean,
  "confidenceScore": number (0 to 100),
  "criticalReasoning": "Short string explaining why."
}
`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "{}";
      res.json(JSON.parse(responseText));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  app.post("/api/send-sms", async (req, res) => {
    try {
      const { contacts, message } = req.body;
      
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !twilioNumber) {
         return res.status(500).json({ error: "Twilio credentials are not configured in the environment." });
      }

      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
         return res.status(400).json({ error: "No emergency contacts provided." });
      }

      const twilio = require('twilio')(accountSid, authToken);

      const promises = contacts.map((contact: string) => 
        twilio.messages.create({
          body: message,
          from: twilioNumber,
          to: contact
        })
      );

      await Promise.all(promises);
      res.json({ success: true, message: "Emergency SMS dispatched securely." });
    } catch (e: any) {
      console.error("Twilio SMS send failed:", e);
      res.status(500).json({ error: e.message || "Failed to send SMS" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
