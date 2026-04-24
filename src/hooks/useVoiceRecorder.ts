import { useState, useRef, useCallback } from 'react';

const getSpeechRecognition = (): any => {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  return win.SpeechRecognition || win.webkitSpeechRecognition;
};

export const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const SpeechRecognition = getSpeechRecognition();
  const [isSupported] = useState(!!SpeechRecognition);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>("");

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    transcriptRef.current = "";
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          transcriptRef.current = currentTranscript;
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error !== 'no-speech') {
             setError(`Speech recognition error: ${event.error}`);
          }
        };

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
           console.warn("Speech recognition failed to start", e);
        }
      }

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
      console.error("Failed to start recording:", err);
      setError(err.message || "Microphone access denied or unavailable.");
      throw err;
    }
  }, [SpeechRecognition]);

  const stopRecording = useCallback((): Promise<{ audioBlob: Blob, finalTranscript: string }> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        resolve({ audioBlob: new Blob(), finalTranscript: transcriptRef.current });
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsRecording(false);
        const finalTranscript = transcriptRef.current.trim() || 'No speech detected. Emergency voice payload attached.';
        resolve({ audioBlob, finalTranscript });
      };

      if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
      
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
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
