(() => {
  const $ = (id) => document.getElementById(id);
  const video = $('video'), overlay = $('overlay'), capture = $('capture');
  const ctx = overlay.getContext('2d'), captureCtx = capture.getContext('2d');
  const stage = $('video-stage');
  const connections = [[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
  const handConnections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  const faceContours = [
    [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
    [70,63,105,66,107],[336,296,334,293,300],
    [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
    [362,398,384,385,386,387,388,466,263,249,390,373,374,380,381,382],
    [168,6,197,195,5,4,1,19,94],[129,98,97,2,326,327,358],
    [61,146,91,181,84,17,314,405,321,375,291,308,324,318,402,317,14,87,178,88,95,78],
    [78,191,80,81,82,13,312,311,310,415,308]
  ];
  const tracked = [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32];
  let stream = null, devices = [], deviceIndex = 0, active = false, paused = false, busy = false;
  let frames = 0, detections = 0, confidenceTotal = 0, startTime = 0, timer = null, lastError = '';
  const dots = $('landmark-dots');
  for (let i=0;i<33;i++){ const dot=document.createElement('i');dot.dataset.id=i;dots.appendChild(dot); }
  function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3200)}
  function clock(){ $('clock').textContent=new Date().toLocaleTimeString('en-GB',{hour12:false}); }
  clock();setInterval(clock,1000);
  function setFeed(live){$('feed-state').classList.toggle('live',live);$('feed-state').querySelector('span').textContent=live?'TRACKING':'STANDBY';$('session-label').textContent=live?'SESSION ACTIVE':'SESSION IDLE';$('session-label').parentElement.classList.toggle('active',live)}
  function clearStats(){frames=0;detections=0;confidenceTotal=0;startTime=Date.now();$('frames').textContent='0';$('detections').textContent='0';$('avg-confidence').innerHTML='—<em>%</em>';$('duration').textContent='00:00';$('session-date').textContent=new Date().toLocaleString(undefined,{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}).toUpperCase();$('alignment').textContent='—';$('alignment-label').textContent='Awaiting pose';$('alignment-status').textContent='NO DATA';$('confidence').textContent='—';$('confidence-bar').style.width='0';$('landmark-count').textContent='—';document.querySelectorAll('.landmark-dots i').forEach(d=>d.classList.remove('on'));$('movement').textContent='Ready';$('movement-hint').textContent='Position yourself in frame';$('score-ring').style.strokeDashoffset=264}
  function updateDuration(){if(!active)return;const s=Math.floor((Date.now()-startTime)/1000);$('duration').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
  async function listCameras(){try{devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput')}catch{devices=[]}}
  async function startCamera(){
    if(!navigator.mediaDevices?.getUserMedia){toast('Camera access needs localhost or a secure connection.');return}
    $('start-btn').disabled=true;
    try{
      await listCameras();
      const preferred=devices[deviceIndex]?.deviceId;
      stream=await navigator.mediaDevices.getUserMedia({video:{deviceId:preferred?{exact:preferred}:undefined,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false});
      video.srcObject=stream;await video.play();await new Promise(resolve=>{if(video.videoWidth)resolve();else video.onloadedmetadata=resolve});
      capture.width=video.videoWidth;capture.height=video.videoHeight;overlay.width=video.videoWidth;overlay.height=video.videoHeight;
      $('resolution').innerHTML=`${video.videoWidth} × ${video.videoHeight} <span>·</span> 30 FPS`;
      const track=stream.getVideoTracks()[0];$('camera-name').textContent=(track.label||'DEFAULT DEVICE').toUpperCase().slice(0,25);
      stage.classList.add('running');$('idle-state').style.display='none';active=true;paused=false;setFeed(true);clearStats();$('pause-btn').disabled=false;$('reset-btn').disabled=false;$('pause-btn').innerHTML='<span>Ⅱ</span> Pause';
      timer=setInterval(updateDuration,1000);requestAnimationFrame(analyzeFrame);
    }catch(err){$('start-btn').disabled=false;let message='Camera could not be started.';if(err.name==='NotAllowedError')message='Camera permission was blocked. Allow access in your browser settings.';if(err.name==='NotFoundError')message='No camera was found. Connect a webcam and try again.';if(err.name==='NotReadableError')message='Camera is in use by another app. Close it and try again.';toast(message);}
  }
  async function analyzeFrame(){
    if(!active||paused){busy=false;if(active)setTimeout(()=>requestAnimationFrame(analyzeFrame),100);return}if(busy){requestAnimationFrame(analyzeFrame);return}busy=true;
    const then=performance.now();captureCtx.drawImage(video,0,0,capture.width,capture.height);
    try{
      const res=await fetch('/api/pose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:capture.toDataURL('image/jpeg',.72)})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||'Analysis failed');
      frames++;$('frames').textContent=frames.toLocaleString();$('latency').textContent=`${Math.round(performance.now()-then)} ms`;
      drawPose(data);if(data.landmarks?.length&&data.metrics){detections++;confidenceTotal+=data.metrics.confidence;$('detections').textContent=detections.toLocaleString();$('avg-confidence').innerHTML=`${Math.round(confidenceTotal/detections)}<em>%</em>`;updateMetrics(data)}
      lastError='';
    }catch(err){if(lastError!==err.message){toast(`Pose service: ${err.message}`);lastError=err.message}}
    busy=false;if(active)requestAnimationFrame(analyzeFrame);
  }
  function drawPose(data){
    ctx.clearRect(0,0,overlay.width,overlay.height);
    const pose=data.landmarks||[], face=data.face||[], left=data.left_hand||[], right=data.right_hand||[];
    $('no-pose').classList.toggle('show',!pose.length);
    const byId=new Map(pose.map(p=>[p.id,p]));ctx.lineCap='round';ctx.lineJoin='round';
    ctx.lineWidth=Math.max(2.1,overlay.width/360);ctx.strokeStyle='#c6f877';ctx.shadowColor='#c6f877';ctx.shadowBlur=7;
    for(const [a,b] of connections){const p=byId.get(a),q=byId.get(b);if(p&&q&&p.visibility>.38&&q.visibility>.38){ctx.globalAlpha=Math.min(p.visibility,q.visibility);ctx.beginPath();ctx.moveTo(p.x*overlay.width,p.y*overlay.height);ctx.lineTo(q.x*overlay.width,q.y*overlay.height);ctx.stroke()}}
    ctx.globalAlpha=1;ctx.shadowBlur=4;for(const p of pose){if(p.visibility<.45)continue;ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,Math.max(2.2,overlay.width/215),0,Math.PI*2);ctx.fillStyle='#e1ffac';ctx.fill()}
    drawHand(left,'#55e6dc');drawHand(right,'#77d5ff');drawFace(face);
    ctx.globalAlpha=1;ctx.shadowBlur=0;
    document.querySelectorAll('.landmark-dots i').forEach(d=>{const p=byId.get(Number(d.dataset.id));d.classList.toggle('on',!!p&&p.visibility>.45)});
    $('landmark-count').textContent=pose.filter(p=>p.visibility>.45).length+face.length+left.length+right.length;
  }
  function drawHand(points,color){
    if(!points?.length)return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=Math.max(1.8,overlay.width/430);ctx.shadowColor=color;ctx.shadowBlur=6;
    for(const [a,b] of handConnections){const p=points[a],q=points[b];if(!p||!q)continue;ctx.beginPath();ctx.moveTo(p.x*overlay.width,p.y*overlay.height);ctx.lineTo(q.x*overlay.width,q.y*overlay.height);ctx.stroke()}
    for(let i=0;i<points.length;i++){const p=points[i];ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,i===0?3.2:2.5,0,Math.PI*2);ctx.fill()}
  }
  function drawFace(points){
    if(!points?.length)return;ctx.strokeStyle='#65d9f1';ctx.fillStyle='#a9f3ff';ctx.lineWidth=Math.max(1.1,overlay.width/760);ctx.shadowColor='#48dfff';ctx.shadowBlur=4;
    for(const chain of faceContours){ctx.beginPath();chain.forEach((id,i)=>{const p=points[id];if(!p)return;const x=p.x*overlay.width,y=p.y*overlay.height;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.closePath();ctx.stroke()}
    ctx.globalAlpha=.72;for(const p of points){ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,Math.max(.8,overlay.width/950),0,Math.PI*2);ctx.fill()}
    ctx.globalAlpha=1;
    for(let i=0;i<points.length;i++){const p=points[i];if(i>=468&&i<=477){ctx.beginPath();ctx.arc(p.x*overlay.width,p.y*overlay.height,2,0,Math.PI*2);ctx.fill()}}
  }
  function updateMetrics(data){const m=data.metrics;$('alignment').textContent=m.alignment;$('alignment-label').textContent=m.alignment>=85?'Well aligned':m.alignment>=65?'Good alignment':'Adjust posture';$('alignment-status').textContent=m.alignment>=85?'BALANCED':m.alignment>=65?'ON TRACK':'ADJUST';$('score-ring').style.strokeDashoffset=264*(1-m.alignment/100);$('confidence').textContent=m.confidence;$('confidence-bar').style.width=`${m.confidence}%`;$('movement').textContent=m.stance;$('movement-hint').textContent=`Shoulder tilt ${m.shoulder_tilt}% · Hip tilt ${m.hip_tilt}%`;$('movement-icon').textContent=m.stance==='Standing'?'⊙':'↗';$('movement-value')?.classList.add('active');$('movement-pulse').style.background='#c2f26a';}
  function stopCamera(){active=false;paused=false;busy=false;if(timer)clearInterval(timer);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;ctx.clearRect(0,0,overlay.width,overlay.height);stage.classList.remove('running');$('idle-state').style.display='flex';$('no-pose').classList.remove('show');$('pause-btn').disabled=true;$('reset-btn').disabled=true;$('start-btn').disabled=false;setFeed(false);}
  $('start-btn').addEventListener('click',startCamera);
  $('pause-btn').addEventListener('click',()=>{if(!active)return;paused=!paused;$('pause-btn').innerHTML=paused?'<span>▶</span> Resume':'<span>Ⅱ</span> Pause';$('movement-hint').textContent=paused?'Tracking paused':'Tracking your movement';if(!paused)requestAnimationFrame(analyzeFrame)});
  $('reset-btn').addEventListener('click',()=>{if(!active)return;clearStats();ctx.clearRect(0,0,overlay.width,overlay.height);toast('Session metrics reset.')});
  $('flip-btn').addEventListener('click',async()=>{if(!active){await listCameras();if(devices.length>1){deviceIndex=(deviceIndex+1)%devices.length;toast(`Camera ${deviceIndex+1} selected. Start the camera to switch.`)}else toast('No alternate camera found.');return}await listCameras();if(devices.length<2){toast('No alternate camera found.');return}deviceIndex=(deviceIndex+1)%devices.length;stopCamera();startCamera()});
  $('fullscreen-btn').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen();else stage.requestFullscreen?.()});
  window.addEventListener('resize',()=>{if(!active)return;overlay.width=video.videoWidth;overlay.height=video.videoHeight});
  navigator.mediaDevices?.addEventListener?.('devicechange',listCameras);
})();
