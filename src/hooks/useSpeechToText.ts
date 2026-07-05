import { useState, useEffect, useRef } from "react";
import { RecordingStatus } from "../types";

export function useSpeechToText() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const recognitionRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const statusRef = useRef<RecordingStatus>("idle");

  // Keep statusRef synced with state to avoid stale closures in events
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "nl-NL"; // Dutch language configuration

    recognition.onstart = () => {
      setError(null);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microfoontoegang geweigerd. Controleer je browserinstellingen.");
      } else if (event.error === "no-speech") {
        // Safe to ignore or show subtle warning
      } else {
        setError(`Spraakherkenningsfout: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // If the engine stopped but we are supposed to be recording, restart it safely after a tiny delay
      if (statusRef.current === "recording" && recognitionRef.current) {
        setTimeout(() => {
          if (statusRef.current === "recording" && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.error("Failed to restart speech recognition:", e);
            }
          }
        }, 150);
      }
    };

    recognition.onresult = (event: any) => {
      let interimResult = "";
      let finalResultForChunk = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalResultForChunk += text + " ";
        } else {
          interimResult += text;
        }
      }

      if (finalResultForChunk) {
        accumulatedTranscriptRef.current += finalResultForChunk;
      }

      // Display the final accumulated text plus any interim text currently spoken
      const currentFullText = (accumulatedTranscriptRef.current + interimResult).trim();
      setTranscript(currentFullText);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const startRecording = () => {
    if (!isSupported) return;
    if (status === "recording") return;

    if (status === "idle") {
      // Clear transcript for a brand new recording
      accumulatedTranscriptRef.current = "";
      setTranscript("");
    }

    statusRef.current = "recording";
    setStatus("recording");
    setError(null);

    try {
      recognitionRef.current.start();
    } catch (e: any) {
      console.error("Start recognition error:", e);
    }
  };

  const pauseRecording = () => {
    if (status !== "recording") return;
    statusRef.current = "paused";
    setStatus("paused");
    try {
      // Disabling onend auto-restart first
      recognitionRef.current.stop();
    } catch (e) {}
  };

  const stopRecording = () => {
    statusRef.current = "idle";
    setStatus("idle");
    try {
      recognitionRef.current.stop();
    } catch (e) {}
  };

  const resetTranscript = () => {
    accumulatedTranscriptRef.current = "";
    setTranscript("");
    setStatus("idle");
    setError(null);
  };

  return {
    status,
    transcript,
    setTranscript,
    error,
    isSupported,
    startRecording,
    pauseRecording,
    stopRecording,
    resetTranscript,
  };
}
