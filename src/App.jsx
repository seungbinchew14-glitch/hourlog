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

  // 방 목록 관련 상태
  const [rooms, setRooms] = useState([]); // [{id, name}]
  const [showRoomList, setShowRoomList] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [activeRoomName, setActiveRoomName] = useState('');

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('user');
  const [nextRecordTime, setNextRecordTime] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const videoRef = useRef(null);

  // 정각 기준 쿨다운 (방마다 별도)
  useEffect(() => {
    if (!roomId) return;
    const checkCooldown = () => {
      const now = Date.now();
      const nowDate = new Date(now);
      // 이번 정각 시작 시각
      const thisHourStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), nowDate.getHours(), 0, 0, 0).getTime();
      // 다음 정각
      const nextHourStart = thisHourStart + 60 * 60 * 1000;

      const lastRecord = parseInt(localStorage.getItem(`vlog_lastRecord_${roomId}`) || '0');

      if (lastRecord >= thisHourStart) {
        // 이번 정각 이후에 이미 찍었음 → 다음 정각까지 대기
        setNextRecordTime(nextHourStart);
        setCooldownLeft(nextHourStart - now);
      } else {
        // 아직 안 찍었음 → 바로 찍기 가능
        setNextRecordTime(null);
        setCooldownLeft(0);
      }
    };
    checkCooldown();
  }, [roomId]);

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

  // 방 목록 로드
  useEffect(() => {
    const savedRooms = localStorage.getItem('vlog_rooms');
    let roomList = savedRooms ? JSON.parse(savedRooms) : [];
    // 가족방 기본 추가
    const familyRoom = { id: '5pgqk0ho', name: '가족방 🏠' };
    if (!roomList.find(r => r.id === familyRoom.id)) {
      roomList = [familyRoom, ...roomList];
      localStorage.setItem('vlog_rooms', JSON.stringify(roomList));
    }
    setRooms(roomList);

    // URL에 room 파라미터 있으면 그걸 현재 방으로
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room');
    if (urlRoom) {
      setRoomId(urlRoom);
      const found = roomList.find(r => r.id === urlRoom);
      setActiveRoomName(found ? found.name : urlRoom);
    } else {
      // 없으면 첫 번째 방으로
      const first = roomList[0];
      setRoomId(first.id);
      setActiveRoomName(first.name);
      try {
        const newUrl = window.location.href.split('?')[0] + '?room=' + first.id;
        window.history.replaceState({}, '', newUrl);
      } catch(e) {}
    }
  }, []);

  const switchRoom = (room) => {
    setRoomId(room.id);
    setActiveRoomName(room.name);
    setShowRoomList(false);
    try {
      const newUrl = window.location.href.split('?')[0] + '?room=' + room.id;
      window.history.replaceState({}, '', newUrl);
    } catch(e) {}
  };

  const addRoom = () => {
    if (!newRoomName.trim()) return;
    const newRoom = { id: Math.random().toString(36).substring(2, 10), name: newRoomName.trim() };
    const updated = [...rooms, newRoom];
    setRooms(updated);
    localStorage.setItem('vlog_rooms', JSON.stringify(updated));
    setNewRoomName('');
    switchRoom(newRoom);
  };

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

  const mediaRecorderRef = useRef(null);
  const progressTimerRef = useRef(null);

  const startRecording = () => {
    if (!stream || isRecording) return;
    setIsRecording(true);
    setRecordProgress(0);
    let chunks = [];
    let options = {};
    // 저용량을 위해 낮은 비트레이트 사용
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options = { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 150000 };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options = { mimeType: 'video/webm', videoBitsPerSecond: 150000 };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4', videoBitsPerSecond: 150000 };
    }
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: options.mimeType || 'video/webm' });
      const now = new Date();
      const timeString = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result;
        try {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'vlogs'), {
            roomId: roomId,
            userId: user.uid,
            nickname: nickname,
            videoData: base64data,
            timestamp: Date.now(),
            timeString: timeString
          });
          const now2 = Date.now();
          localStorage.setItem(`vlog_lastRecord_${roomId}`, now2.toString());
          const nowDate2 = new Date(now2);
          const nextHour = new Date(nowDate2.getFullYear(), nowDate2.getMonth(), nowDate2.getDate(), nowDate2.getHours() + 1, 0, 0, 0).getTime();
          setNextRecordTime(nextHour);
        } catch(e) {
          console.error("업로드 오류:", e);
          showToast("업로드 실패. 영상이 너무 길어요!", 'error');
        }
        closeCamera();
      };
    };
    mediaRecorder.start();
    // 최대 5초 자동 정지
    const maxDuration = 5000;
    const interval = 50;
    let elapsed = 0;
    progressTimerRef.current = setInterval(() => {
      elapsed += interval;
      setRecordProgress(Math.min((elapsed / maxDuration) * 100, 100));
      if (elapsed >= maxDuration) stopRecording();
    }, interval);
  };

  const stopRecording = () => {
    if (!isRecording) return;
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleDelete = async (vlog) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vlogs', vlog.id));
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
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-4 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => setShowRoomList(true)} className="flex items-center gap-1.5 text-sm font-black tracking-tighter bg-black/40 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-sm">
          <Clock className="w-4 h-4 text-blue-400" />
          <span className="max-w-[100px] truncate">{activeRoomName || 'HourLog'}</span>
          <span className="text-gray-400 text-xs">▼</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={copyInviteLink} className="flex items-center gap-1 text-xs bg-blue-600/80 hover:bg-blue-500 text-white px-3 py-1.5 rounded-full border border-blue-400/50 backdrop-blur-sm transition-colors shadow-lg">
            <Copy className="w-3 h-3" />
            <span>초대 복사</span>
          </button>
          <div className="flex items-center gap-1 text-xs bg-gray-800/80 px-3 py-1.5 rounded-full border border-gray-700 backdrop-blur-sm">
            <Users className="w-3 h-3 text-blue-300" />
            <span className="truncate max-w-[50px]">{nickname}</span>
          </div>
        </div>
      </header>

      {/* 방 목록 모달 */}
      {showRoomList && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-gray-900 rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-black">내 방 목록</h2>
              <button onClick={() => setShowRoomList(false)} className="p-2 bg-gray-800 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col gap-2 mb-6">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => switchRoom(room)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${room.id === roomId ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'}`}
                >
                  <span className="font-bold">{room.name}</span>
                  {room.id === roomId && <span className="text-xs text-blue-400">현재 방</span>}
                </button>
              ))}
            </div>
            <div className="border-t border-gray-700 pt-4">
              <p className="text-gray-400 text-sm mb-3">새 방 만들기</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="방 이름 (예: 수아방 🌸)"
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={15}
                  onKeyDown={(e) => e.key === 'Enter' && addRoom()}
                />
                <button onClick={addRoom} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-colors">
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-2 grid-rows-2 gap-1 px-1">
            {vlogs.map((vlog) => (
              <div key={vlog.id} className="relative w-full aspect-[9/16] bg-gray-900 rounded-md overflow-hidden flex items-center justify-center">
                <video src={vlog.videoData} autoPlay loop muted playsInline className="w-full h-full object-cover opacity-90" />
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
              다음 정각까지 {Math.floor(cooldownLeft / 3600000) > 0 ? `${Math.floor(cooldownLeft / 3600000)}시간 ` : ''}{Math.floor((cooldownLeft % 3600000) / 60000)}분 {Math.floor((cooldownLeft % 60000) / 1000)}초
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
            <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
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
          <div className="h-36 bg-black flex flex-col items-center justify-center pb-6 gap-2">
            <p className="text-gray-400 text-xs">
              {isRecording ? '다시 누르면 업로드돼요!' : '버튼을 눌러서 녹화 시작'}
            </p>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!stream}
              className={`relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white transition-all active:scale-95 ${isRecording ? 'scale-110' : ''}`}
            >
              <div className={`w-16 h-16 transition-all ${isRecording ? 'bg-red-600 scale-75 rounded-lg' : 'bg-red-500 rounded-full'}`} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
