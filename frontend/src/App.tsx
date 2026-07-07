import { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface QuizData {
  question: string;
  options: string[];
  correctOption: string;
  explanation: string;
}

interface IdiomData {
  idiom: string;
  quiz: QuizData;
  imageUrl: string;
}

function App() {
  const [idiom, setIdiom] = useState<string>('');
  const [illustrationUrl, setIllustrationUrl] = useState<string>('');
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [score, setScore] = useState<number>(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const pollingIntervalRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  /**
   * Starts polling the API for status updates of the generation task
   */
  const startPolling = (targetIdiom: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/status/${encodeURIComponent(targetIdiom)}`);
        if (!response.ok) {
          if (response.status === 404) {
            // Task not found
            return;
          }
          throw new Error('Failed to fetch status update.');
        }

        const data = await response.json();
        if (data.status === 'completed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setIllustrationUrl(data.data.imageUrl);
          setQuiz(data.data.quiz);
          setStatus('completed');
        } else if (data.status === 'failed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setErrorMessage(data.error || 'Generation failed.');
          setStatus('failed');
        }
      } catch (error: any) {
        console.error('Polling error:', error);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setErrorMessage(error?.message || 'Network connection lost.');
        setStatus('failed');
      }
    };

    // Poll every 1.5 seconds
    pollingIntervalRef.current = window.setInterval(poll, 1500);
  };

  /**
   * Triggers the dynamic idiom shuffle endpoint
   */
  const handleShuffle = async () => {
    // Reset states
    setStatus('processing');
    setSelectedOption(null);
    setIsAnswered(false);
    setQuiz(null);
    setIllustrationUrl('');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/shuffle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Could not trigger shuffle. Please check server connection.');
      }

      const result = await response.json();
      setIdiom(result.idiom);

      if (result.status === 'completed') {
        // Cache hit
        setIllustrationUrl(result.data.imageUrl);
        setQuiz(result.data.quiz);
        setStatus('completed');
      } else {
        // Cache miss, started background generation task
        startPolling(result.idiom);
      }
    } catch (error: any) {
      console.error('Shuffle error:', error);
      setErrorMessage(error?.message || 'Server is not responding.');
      setStatus('failed');
    }
  };

  /**
   * Handles user selecting a quiz answer
   */
  const handleSelectOption = (option: string) => {
    if (isAnswered || !quiz) return;
    
    setSelectedOption(option);
    setIsAnswered(true);

    if (option.trim().toLowerCase() === quiz.correctOption.trim().toLowerCase()) {
      setScore((prev) => prev + 1);
    }
  };

  // Helper to determine CSS classes for option buttons after answering
  const getOptionClass = (option: string) => {
    if (!quiz) return '';
    if (!isAnswered) {
      return selectedOption === option ? 'selected' : '';
    }
    const isCurrentCorrect = option.trim().toLowerCase() === quiz.correctOption.trim().toLowerCase();
    const isCurrentSelected = selectedOption === option;

    if (isCurrentCorrect) {
      return 'correct';
    }
    if (isCurrentSelected && !isCurrentCorrect) {
      return 'incorrect';
    }
    return '';
  };

  return (
    <div>
      <header className="app-header">
        <h1 className="app-title">Piece of Cake</h1>
        <p className="app-subtitle">Gamified English Idioms Lab</p>
        <span className="score-badge">Correct Answers: {score}</span>
      </header>

      <main className="challenge-card">
        {status === 'idle' && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p style={{ color: '#52525b', marginBottom: '1.5rem' }}>
              Learn advanced American idioms by translating literal illustrations.
            </p>
            <button className="action-button" onClick={handleShuffle}>
              Start Learning
            </button>
          </div>
        )}

        {status === 'processing' && (
          <div className="loader-container">
            <div className="spinner"></div>
            <p className="loader-text">
              Generating dynamic idiom quiz...<br />
              <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                Illustrating "{idiom}" using Nano Banana 2
              </span>
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <p style={{ color: '#ef4444', fontWeight: 500, marginBottom: '1rem' }}>
              {errorMessage}
            </p>
            <button className="action-button" onClick={handleShuffle}>
              Try Another Idiom
            </button>
          </div>
        )}

        {status === 'completed' && quiz && (
          <>
            <h2 className="challenge-title">What idiom is illustrated literally below?</h2>
            
            <div className="illustration-container">
              {illustrationUrl && (
                <img
                  src={illustrationUrl}
                  alt="Literal illustration of idiom"
                  className="illustration-img"
                />
              )}
            </div>

            <div className="quiz-section">
              <p className="quiz-question">{quiz.question}</p>
              
              {quiz.options.map((option, idx) => (
                <button
                  key={idx}
                  className={`option-button ${getOptionClass(option)}`}
                  onClick={() => handleSelectOption(option)}
                  disabled={isAnswered}
                >
                  {option}
                </button>
              ))}
            </div>

            {isAnswered && (
              <>
                <div className="explanation-panel">
                  <div className="explanation-title">
                    {selectedOption === quiz.correctOption ? '🎉 Correct!' : '❌ Incorrect'}
                  </div>
                  <p style={{ margin: 0 }}>{quiz.explanation}</p>
                </div>

                <button className="action-button" onClick={handleShuffle}>
                  Shuffle Next Idiom
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
