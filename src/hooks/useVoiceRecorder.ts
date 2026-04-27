import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";

export const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported] = useState(true); // Always supported since we use MediaRecorder + Gemini
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      setError(err.message || "Microphone access denied or unavailable.");
      throw err;
    }
  }, []);

  const transcribeAudioBuffer = async (audioBlob: Blob): Promise<string> => {
    try {
      // @ts-ignore - Vite process.env injection
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          } else {
            reject(new Error("Failed to read blob"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      let baseMimeType = (audioBlob.type || "audio/webm").split(';')[0].toLowerCase();
      // Ensure the mimeType is something Gemini respects, fallback to audio/mp4 for iOS or webm
      if (!['audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/mpeg', 'audio/webm'].includes(baseMimeType)) {
        baseMimeType = 'audio/webm'; 
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", // Use standard flash model for reliability in speech transcription
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: baseMimeType,
              },
            },
            { text: "You are an emergency distress transcriber. Transcribe this audio exactly as it is spoken. If it's silent, noisy, or unintelligible, just output 'No speech detected. Emergency payload attached.' Do not add formatting." }
          ],
        },
      });
      
      return response.text || "No speech detected. Emergency payload attached.";
    } catch (err) {
      console.error("Transcription error:", err);
      return "No speech detected. Emergency payload attached.";
    }
  };

  const stopRecording = useCallback((): Promise<{ audioBlob: Blob; getTranscript: () => Promise<string> }> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve({ audioBlob: new Blob(), getTranscript: async () => "" });
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const actualMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        setIsRecording(false);
        
        // Stop the tracks after the blob is securely captured
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        
        resolve({ 
          audioBlob, 
          getTranscript: async () => {
            const finalTranscript = await transcribeAudioBuffer(audioBlob);
            setTranscript(finalTranscript);
            return finalTranscript;
          }
        });
      };

      if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      } else {
        // Fallback for if it was somehow already inactive
        if (mediaRecorderRef.current?.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
      }
    });
  }, []);

  return {
    isRecording,
    transcript,
    error,
    isSupported,
    startRecording,
    stopRecording
  };
};
