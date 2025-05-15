const { ipcRenderer, shell} = require('electron');
const remote = require("@electron/remote");
const obsRecorder = require('./obsRecorder');
const path = require('path');

function initOBS(win) {
  // const result = await ipcRenderer.invoke('recording-init');
  const result  = obsRecorder.initialize(win);
  console.debug("initOBS result:", result);
  if (result) {
    ipcRenderer.on("performanceStatistics", (_event, data) => onPerformanceStatistics(data));
  }
}

async function startRecording() {
  // const result = await ipcRenderer.invoke('recording-start');
  const result = obsRecorder.start();
  console.debug("startRecording result:", result);
  return result;
}

async function stopRecording() {
  // const result = await ipcRenderer.invoke('recording-stop');
  const result = await obsRecorder.stop();
  console.debug("stopRecording result:", result);
  return result;
}

let recording = false;
let virtualCamRunning = false;
let recordingStartedAt = null;
let timer = null;

async function switchRecording() {
  if (recording) {
    recording = (await stopRecording()).recording;
  } else {
    recording = (await startRecording()).recording;
  }
  updateRecordingUI();
}

function updateRecordingUI() {
  const button = document.getElementById('rec-button');
  button.disabled = false;
  if (recording) {
    button.innerText = '⏹️ Stop recording'
    startTimer();
  } else {
    button.innerText = '⏺️ Start recording'
    stopTimer();
  }
}

async function updateVirtualCamUI() {
  // if (await ipcRenderer.invoke('isVirtualCamPluginInstalled')) {
  if (obsRecorder.isVirtualCamPluginInstalled()) {
    document.querySelector("#install-virtual-cam-plugin-button").style.display = "none";
    if (virtualCamRunning) {
      document.querySelector("#virtual-cam-plugin-status").innerText = "Running";
      document.querySelector("#stop-virtual-cam-button").style.display = "";
      document.querySelector("#start-virtual-cam-button").style.display = "none";
      document.querySelector("#uninstall-virtual-cam-plugin-button").style.display = "none";
    } else {
      document.querySelector("#virtual-cam-plugin-status").innerText = "Plugin installed";
      document.querySelector("#stop-virtual-cam-button").style.display = "none";
      document.querySelector("#start-virtual-cam-button").style.display = "";
      document.querySelector("#uninstall-virtual-cam-plugin-button").style.display = "";
    }
  } else {
    document.querySelector("#virtual-cam-plugin-status").innerText = "Plugin not installed";
    document.querySelector("#install-virtual-cam-plugin-button").style.display = "";
    document.querySelector("#uninstall-virtual-cam-plugin-button").style.display = "none";
    document.querySelector("#start-virtual-cam-button").style.display = "none";
    document.querySelector("#stop-virtual-cam-button").style.display = "none";
  }
}

async function uninstallVirtualCamPlugin() {
  // await ipcRenderer.invoke('uninstallVirtualCamPlugin');
  obsRecorder.uninstallVirtualCamPlugin();
  await updateVirtualCamUI();
}

async function installVirtualCamPlugin() {
  // await ipcRenderer.invoke('installVirtualCamPlugin');
  obsRecorder.installVirtualCamPlugin();
  await updateVirtualCamUI();
}

async function startVirtualCam() {
  // await ipcRenderer.invoke('startVirtualCam');
  obsRecorder.startVirtualCam();
  virtualCamRunning = true;
  await updateVirtualCamUI();
}
async function shutdownOBS() {
    obsRecorder.shutdown();
    await updateVirtualCamUI();
}

async function stopVirtualCam() {
  // await ipcRenderer.invoke('stopVirtualCam');
  obsRecorder.stopVirtualCam();
  virtualCamRunning = false;
  await updateVirtualCamUI();
}

function startTimer() {
  recordingStartedAt = Date.now();
  timer = setInterval(updateTimer, 100);
}

function stopTimer() {
  clearInterval(timer);
}

function updateTimer() {
  const diff = Date.now() - recordingStartedAt;
  const timerElem = document.getElementById('rec-timer');
  const decimals = `${Math.floor(diff % 1000 / 100)}`;
  const seconds  = `${Math.floor(diff % 60000 / 1000)}`.padStart(2, '0');
  const minutes  = `${Math.floor(diff % 3600000 / 60000)}`.padStart(2, '0');
  const hours    = `${Math.floor(diff / 3600000)}`.padStart(2, '0');
  timerElem.innerText = `${hours}:${minutes}:${seconds}.${decimals}`;
}

function openFolder() {
  shell.openPath(remote.app.getPath("videos"));
}

function onPerformanceStatistics(data) {
  document.querySelector(".performanceStatistics #cpu").innerText = `${data.CPU} %`;
  document.querySelector(".performanceStatistics #cpuMeter").value = data.CPU;
  document.querySelector(".performanceStatistics #numberDroppedFrames").innerText = data.numberDroppedFrames;
  document.querySelector(".performanceStatistics #percentageDroppedFrames").innerText = `${data.percentageDroppedFrames} %`;
  document.querySelector(".performanceStatistics #bandwidth").innerText = data.bandwidth;
  document.querySelector(".performanceStatistics #frameRate").innerText = `${Math.round(data.frameRate)} fps`;
}

const previewContainer = document.getElementById('preview');

async function setupPreview(win) {
  const { width, height, x, y } = previewContainer.getBoundingClientRect();
  console.log("width : " + width + " height : " + height + " x : ", x, " y : " + y)
  // const result = await ipcRenderer.invoke('preview-init', { width, height, x, y });
  const result = obsRecorder.setupPreview(win, { width, height, x, y });
  console.log('setupPreview result: ' + result)
  previewContainer.style = `height: ${result.height}px`;
}

async function resizePreview() {
  const { width, height, x, y } = previewContainer.getBoundingClientRect();
  // const result = await ipcRenderer.invoke('preview-bounds', { width, height, x, y });

  const result = obsRecorder.resizePreview(currentWindow, { width, height, x, y });
  previewContainer.style = `height: ${result.height}px`;
}

async function startTask(currentWindow) {
  initOBS(currentWindow);
  setupPreview(currentWindow);
  updateRecordingUI();
  updateVirtualCamUI();
}

// 监听渲染进程的 beforeunload 事件
window.addEventListener('beforeunload', (event) => {
  console.log("will shutdown")
  obsRecorder.shutdown();
  // 可选：阻止默认行为
  // event.returnValue = false;
});

const currentWindow = remote.getCurrentWindow();
currentWindow.on('resize', resizePreview);
document.addEventListener("scroll",  resizePreview);
var ro = new ResizeObserver(resizePreview);
ro.observe(document.querySelector("#preview"));

try {
  startTask(currentWindow)
} catch (err) {
  console.log(err)
}
