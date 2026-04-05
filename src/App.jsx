import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Camera, Video, Clock, X, Loader2, AlertCircle, Users, ArrowRight, RefreshCcw, Trash2, Copy, CheckCircle2 } from 'lucide-react';

// --- Firebase 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyByD2EaE5KMq3tK0vLGg2JgIs7pnpXO5rY",
  authDomain: "vlogggg-9aa76.firebaseapp.com",
  projectId: "vlogggg-9aa76",
  storageBucket: "vlogggg-9aa76.firebasestorage.app",
  messagingSenderId: "655307131140",
  appId: "1:655307131140:web:c947149b5f698ec21fa851"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const appId = 'hourlog-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [vlogs, setVlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [roomId, setRoomId] = useState('');

  const [nickname, setNickname] = useState('');
  const [isJoined, setIsJoined] = useState(false);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [nextRecordTime, setNextRecordTime] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const videoRef = useRef(null);

  // 30분 쿨다운 타이머
  useEffect(() => {
    const saved = localStorage.getItem('vlog_lastRecord');
    if (saved) {
      const next = parseInt(saved) + 30 * 60 * 1000;
      setNextRecordTime(next);
    }
  }, []);

  useEffect(() => {
    if (!nextRecordTime) return;
    const interval = setInterval(() => {
      const left = nextRecordTime - Date.now();
      if (left <= 0) {
        setCooldownLeft(0);
        setNextRecordTime(null);
        clearInterval(interval);
      } else {
        setCooldownLeft(left);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [nextRecordTime]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      let currentRoom = params.get('room');
      if (!currentRoom) {
        const savedRoom = localStorage.getItem('vlog_roomId');
        if (savedRoom) {
          currentRoom = savedRoom;
        } else {
          currentRoom = Math.random().toString(36).substring(2, 10);
        }
        try {
          const newUrl = window.location.href.split('?')[0] + '?room=' + currentRoom;
          window.history.replaceState({ path: newUrl }, '', newUrl);
        } catch (e) {}
      }
      setRoomId(currentRoom);
      localStorage.setItem('vlog_roomId', currentRoom);
    } catch (e) {
      const fallbackRoom = Math.random().toString(36).substring(2, 10);
      setRoomId(fallbackRoom);
      localStorage.setItem('vlog_roomId', fallbackRoom);
    }
  }, []);

  useEffect(() => {
    const savedNickname = localStorage.getItem('vlog_nickname');
    if (savedNickname) {
      setNickname(savedNickname);
      setIsJoined(true);
    }
  }, []);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 4000);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("인증 오류:", e);
        showToast('로그인에 실패했습니다.', 'error');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isJoined || !roomId) return;
    const vlogsRef = collection(db, 'artifacts', appId, 'public', 'data', 'vlogs');
    const unsubscribe = onSnapshot(vlogsRef, (snapshot) => {
      const fetchedVlogs = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.roomId === roomId) {
          fetchedVlogs.push({ id: doc.id, ...data });
        }
      });
      fetchedVlogs.sort((a, b) => b.timestamp - a.timestamp);
      setVlogs(fetchedVlogs);
    }, (err) => {
      console.error("데이터 로드 오류:", err);
      showToast('피드를 불러오는데 실패했습니다.', 'error');
    });
    return () => unsubscribe();
  }, [user, isJoined, roomId]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (nickname.trim().length === 0) {
      showToast('이름을 입력해주세요!', 'error');
      return;
    }
    localStorage.setItem('vlog_nickname', nickname.trim());
    setIsJoined(true);
  };

  const openCamera = async () => {
    if (cooldownLeft > 0) {
      const mins = Math.ceil(cooldownLeft / 60000);
      showToast(`${mins}분 후에 다시 찍을 수 있어요!`, 'error');
      return;
    }
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
        audio: false
      });
      setStream(mediaStream);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      }, 100);
    } catch (e) {
      showToast("카메라 접근 권한이 필요합니다.", 'error');
      closeCamera();
    }
  };

  const toggleCamera = async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (stream) stream.getTracks().forEach(track => track.stop());
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode, width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
        audio: false
      });
      setStream(mediaStream);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      }, 100);
    } catch (e) {
      showToast("카메라를 전환할 수 없습니다.", 'error');
    }
  };

  const closeCamera = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsCameraOpen(false);
    setIsRecording(false);
    setRecordProgress(0);
  };

  const startRecording = () => {
    if (!stream) return;
    setIsRecording(true);
    setRecordProgress(0);
    let chunks = [];
    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 800000 };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4', videoBitsPerSecond: 800000 };
    }
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
      const now = new Date();
      const timeString = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      try {
        // Firebase Storage에 영상 업로드
        const fileName = `vlogs/${roomId}/${Date.now()}.webm`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, blob);
        const downloadURL = await getDownloadURL(storageRef);

        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'vlogs'), {
          roomId: roomId,
          userId: user.uid,
          nickname: nickname,
          videoURL: downloadURL,
          storagePath: fileName,
          timestamp: Date.now(),
          timeString: timeString
        });
        // 30분 쿨다운 시작
        const now2 = Date.now();
        localStorage.setItem('vlog_lastRecord', now2.toString());
        setNextRecordTime(now2 + 30 * 60 * 1000);
      } catch(e) {
        console.error("업로드 오류:", e);
        showToast("업로드 실패. 다시 시도해주세요.", 'error');
      }
      closeCamera();
    };
    mediaRecorder.start();
    const duration = 3000;
    const interval = 50;
    let elapsed = 0;
    const progressTimer = setInterval(() => {
      elapsed += interval;
      setRecordProgress((elapsed / duration) * 100);
      if (elapsed >= duration) {
        clearInterval(progressTimer);
        mediaRecorder.stop();
      }
    }, interval);
  };

  const handleDelete = async (vlog) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vlogs', vlog.id));
      if (vlog.storagePath) {
        const storageRef = ref(storage, vlog.storagePath);
        await deleteObject(storageRef);
      }
      showToast('영상이 삭제되었습니다.', 'success');
    } catch(e) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  };

  const copyInviteLink = async () => {
    let inviteUrl = window.location.href;
    if (!inviteUrl.includes('room=')) {
      inviteUrl = inviteUrl.split('?')[0] + '?room=' + roomId;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('초대 링크가 복사되었습니다! 친구에게 보내보세요.', 'success');
        return;
      }
    } catch (err) {}
    const el = document.createElement('textarea');
    el.value = inviteUrl;
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, 99999);
    try {
      document.execCommand('copy');
      showToast('초대 링크가 복사되었습니다! 친구에게 보내보세요.', 'success');
    } catch (err) {
      showToast('주소창을 직접 복사해주세요!', 'error');
    }
    document.body.removeChild(el);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p>친구들의 일상을 불러오는 중...</p>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white px-6">
        <div className="max-w-md w-full bg-gray-900 p-8 rounded-2xl shadow-2xl border border-gray-800 text-center">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-black mb-2 tracking-tight">HourLog</h1>
          <p className="text-gray-400 mb-8 text-sm">친구들과 매시간 3초의 일상을 공유하세요</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="내 이름이나 별명을 적어주세요"
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 text-center text-lg"
              maxLength={10}
            />
            <button type="submit" className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold transition-colors">
              시작하기 <ArrowRight className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen bg-gray-950 text-gray-100 font-sans mx-auto max-w-md overflow-hidden pb-20 shadow-2xl">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent">
        <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
          <Clock className="w-6 h-6 text-blue-400" />
          HourLog
        </h1>
        <div className="flex items-center gap-3">
          <button onClick={copyInviteLink} className="flex items-center gap-1 text-xs bg-blue-600/80 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full border border-blue-400/50 backdrop-blur-sm transition-colors shadow-lg">
            <Copy className="w-3 h-3" />
            <span>초대 복사</span>
          </button>
          <div className="flex items-center gap-1 text-xs bg-gray-800/80 px-3 py-1.5 rounded-full border border-gray-700 backdrop-blur-sm">
            <Users className="w-3 h-3 text-blue-300" />
            <span className="truncate max-w-[60px]">{nickname}</span>
          </div>
        </div>
      </header>

      {toast.msg && (
        <div className={`absolute top-20 left-1/2 transform -translate-x-1/2 z-50 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm w-11/12 max-w-sm backdrop-blur-md transition-all ${toast.type === 'error' ? 'bg-red-500/90' : 'bg-green-500/90'}`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
          <p>{toast.msg}</p>
        </div>
      )}

      <div className="w-full h-full min-h-screen overflow-y-auto bg-black pt-20 pb-24">
        {vlogs.length === 0 ? (
          <div className="h-[70vh] flex flex-col items-center justify-center text-gray-500 px-6 text-center">
            <Video className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-xl font-bold mb-2">아직 기록이 없습니다.</h2>
            <p className="text-sm">하단 카메라 버튼을 눌러 첫 일상을 기록하세요!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 px-1">
            {vlogs.map((vlog) => (
              <div key={vlog.id} className="relative w-full aspect-[9/16] bg-gray-900 rounded-md overflow-hidden flex items-center justify-center">
                <video src={vlog.videoURL} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60" />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-3xl font-black text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] tracking-tighter mix-blend-overlay opacity-90">
                    {vlog.timeString}
                  </div>
                </div>
                {user && vlog.userId === user.uid && (
                  <button onClick={() => handleDelete(vlog)} className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 text-white rounded-full backdrop-blur-sm transition-colors border border-white/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <div className="absolute bottom-2 left-2 right-2 text-left pointer-events-none">
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg border border-white/30 shrink-0">
                      <span className="font-bold text-[10px] text-white">{(vlog.nickname || "알").substring(0, 1)}</span>
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-bold text-[11px] text-white drop-shadow-md truncate leading-tight">{vlog.nickname || "익명"}</span>
                      <span className="text-[9px] text-gray-300 drop-shadow-md truncate leading-tight">
                        {new Date(vlog.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute:'2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!isCameraOpen && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center gap-2">
          {cooldownLeft > 0 && (
            <div className="bg-black/70 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm border border-white/20">
              {Math.floor(cooldownLeft / 60000)}분 {Math.floor((cooldownLeft % 60000) / 1000)}초 후 촬영 가능
            </div>
          )}
          <button
            onClick={openCamera}
            className={`flex items-center justify-center w-16 h-16 rounded-full border-4 border-gray-900 transition-transform active:scale-95 ${cooldownLeft > 0 ? 'bg-gray-600 opacity-60' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.5)]'}`}
          >
            <Camera className="w-7 h-7 text-white" />
          </button>
        </div>
      )}

      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={closeCamera} className="p-2 bg-black/50 rounded-full text-white backdrop-blur-md">
              <X className="w-6 h-6" />
            </button>
            <div className="bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-md text-sm font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              3초 브이로그
            </div>
            <button onClick={toggleCamera} className="p-2 bg-black/50 rounded-full text-white backdrop-blur-md transition-transform active:scale-90">
              <RefreshCcw className="w-6 h-6" />
            </button>
          </div>
          <div className="relative flex-1 bg-gray-900 flex items-center justify-center overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {isRecording && (
              <div className="absolute top-20 left-1/2 transform -translate-x-1/2 w-3/4 max-w-xs h-2 bg-gray-800/80 rounded-full overflow-hidden backdrop-blur-md border border-white/20">
                <div className="h-full bg-red-500 transition-all duration-75 ease-linear" style={{ width: `${recordProgress}%` }} />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
              <div className="text-6xl font-black text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] mix-blend-overlay">
                {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          <div className="h-32 bg-black flex items-center justify-center pb-6">
            <button onClick={startRecording} disabled={isRecording || !stream} className={`relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white transition-all ${isRecording ? 'scale-110 opacity-80' : 'active:scale-95'}`}>
              <div className={`w-16 h-16 rounded-full transition-all ${isRecording ? 'bg-red-600 scale-75 rounded-lg' : 'bg-red-500'}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
