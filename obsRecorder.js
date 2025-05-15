const path = require('path');
const { Subject } = require('rxjs');
const { first } = require('rxjs/operators');
const { byOS, OS, getOS } = require('./operating-systems');
const { ipcRenderer } = require('electron');
const osn = require("obs-studio-node");
// const { v4:uuid } = require('uuid');
// const { v4: uuidv4 } = require('uuid');
const { v4: uuidv4 } = require('uuid');
const { error } = require('console');


let nwr;

// NWR is used to handle display rendering via IOSurface on mac
if (getOS() === OS.Mac) {
  nwr = require('node-window-rendering');
}

let obsInitialized = false;
let scene = null;

// When packaged, we need to fix some paths
function fixPathWhenPackaged(p) {
  return p.replace("app.asar", "app.asar.unpacked");
}

// Init the library, launch OBS Studio instance, configure it, set up sources and scene
function initialize(win) {
  if (obsInitialized) {
    console.warn("OBS is already initialized, skipping initialization.");
    return true;
  }

  initOBS();
  configureOBS();
  scene = setupScene();
  setupSources(scene);
  obsInitialized = true;

  // const perfStatTimer = setInterval(() => {
	//   win.webContents.send("performanceStatistics", osn.NodeObs.OBS_API_getPerformanceStatistics());
  // }, 1000);

  // win.on('close', () => clearInterval(perfStatTimer));
  return true;
}

function initOBS() {
  console.debug('Initializing OBS...');
  osn.IPC.host(`${uuidv4()}`);
  const obsPakagePath = path.join(remote.app.getAppPath(), "node_modules", "obs-studio-node");
  console.log(obsPakagePath);
  osn.NodeObs.SetWorkingDirectory(obsPakagePath);
  const obsDataPath = path.join(remote.app.getAppPath(), "osn-data");
  console.log(obsDataPath);
  const initResult = osn.NodeObs.OBS_API_initAPI("en-US", obsDataPath, "1.0.0", "");
  console.log("initbosx...", initResult === 0 ? "success" : "error");
  if (initResult !== 0) {
    const errorReasons = {
      '-2': 'DirectX could not be found on your system. Please install the latest version of DirectX for your machine here <https://www.microsoft.com/en-us/download/details.aspx?id=35?> and try again.',
      '-5': 'Failed to initialize OBS. Your video drivers may be out of date, or Streamlabs OBS may not be supported on your system.',
    }

    const errorMessage = errorReasons[initResult.toString()] || `An unknown error #${initResult} was encountered while initializing OBS.`;

    console.error('OBS init failure', errorMessage);

    shutdown();

    throw Error(errorMessage);
  }

  osn.NodeObs.OBS_service_connectOutputSignals((signalInfo) => {
    signals.next(signalInfo);
  });

  console.debug('OBS initialized');
}

function configureOBS() {

  console.debug("Configuring OBS");
  setSetting('Output', 'Mode', 'Advanced');
  const availableEncoders = getAvailableValues('Output', 'Recording', 'RecEncoder');
  setSetting('Output', 'RecEncoder', availableEncoders.slice(-1)[0] || 'x264');
  setSetting('Output', 'RecFilePath', remote.app.getPath("videos"));
  setSetting('Output', 'RecFormat', 'mkv');
  setSetting('Output', 'VBitrate', 10000); // 10 Mbps
  setSetting('Video', 'FPSCommon', 60);
  console.log("OBS Configured");
}

function isVirtualCamPluginInstalled() {
  const result = osn.NodeObs.OBS_service_isVirtualCamPluginInstalled();
  console.log("OBS_service_isVirtualCamPluginInstalled : " + result)
  if (result === 2) {
    return true;
  }
  return false;
}

function installVirtualCamPlugin() {
  osn.NodeObs.OBS_service_installVirtualCamPlugin();
  return isVirtualCamPluginInstalled();
}

function uninstallVirtualCamPlugin() {
  osn.NodeObs.OBS_service_uninstallVirtualCamPlugin();
  return !isVirtualCamPluginInstalled();
}

function startVirtualCam() {
  // osn.NodeObs.startVirtualCam();
  osn.NodeObs.OBS_service_startVirtualCam();
}

function stopVirtualCam() {
  // osn.NodeObs.stopVirtualCam();
  osn.NodeObs.OBS_service_stopVirtualCam();
}

function setupScene() {
  const browser_source = osn.InputFactory.create('browser_source', 'browser_source');
  let { physicalWidth, physicalHeight, aspectRatio } = displayInfo();
  console.log("physicalWidth = "+  physicalWidth + "physicalHeight = " + physicalHeight)
  physicalWidth = 1080;
  physicalHeight = 1920;
  let settings = browser_source.settings;
  settings['width'] = physicalWidth;
  settings['height'] = physicalHeight;
  // settings['url'] = 'https://c.lnsee.com/lxweb/#/rtc?url=webrtc://bjwebrtc16.jinsemengxiang.cn/lxlive/197215'
  settings['url'] = 'https://c.lnsee.com/lxweb/#/rtc?url=webrtc://bjwebrtc15.jinsemengxiang.cn/lxlive/149725'
  // settings['url'] = 'https://www.baidu.com';
  browser_source.update(settings);
  browser_source.save();``

  // Set output video size to 1920x1080
  const outputWidth = 1080;
  // const outputHeight = Math.round(outputWidth / aspectRatio);
  const outputHeight = 1920;
  setSetting('Video', 'Base', `${outputWidth}x${outputHeight}`);
  setSetting('Video', 'Output', `${outputWidth}x${outputHeight}`);
  const videoScaleFactor = physicalWidth / outputWidth;

  // A scene is necessary here to properly scale captured screen size to output video size
  const scene = osn.SceneFactory.create('test-scene');
  const sceneItem = scene.add(browser_source);
  sceneItem.scale = { x: 1.0/ videoScaleFactor, y: 1.0 / videoScaleFactor };
  return scene;
}

function getAudioDevices(type, subtype) {
  const dummyDevice = osn.InputFactory.create(type, subtype, { device_id: 'does_not_exist' });
  const devices = dummyDevice.properties.get('device_id').details.items.map(({ name, value }) => {
    return { device_id: value, name,};
  });
  dummyDevice.release();
  return devices;
};

function setupSources() {
  osn.Global.setOutputSource(1, scene);

  setSetting('Output', 'Track1Name', 'Mixed: all sources');
  let currentTrack = 2;

  getAudioDevices(byOS({ [OS.Windows]: 'wasapi_output_capture', [OS.Mac]: 'coreaudio_output_capture' }), 'desktop-audio').forEach(metadata => {
    if (metadata.device_id === 'default') return;
    const source = osn.InputFactory.create(byOS({ [OS.Windows]: 'wasapi_output_capture', [OS.Mac]: 'coreaudio_output_capture' }), 'desktop-audio', { device_id: metadata.device_id });
    setSetting('Output', `Track${currentTrack}Name`, metadata.name);
    source.audioMixers = 1 | (1 << currentTrack-1); // Bit mask to output to only tracks 1 and current track
    osn.Global.setOutputSource(currentTrack, source);
    currentTrack++;
  });

  getAudioDevices(byOS({ [OS.Windows]: 'wasapi_input_capture', [OS.Mac]: 'coreaudio_input_capture' }), 'mic-audio').forEach(metadata => {
    if (metadata.device_id === 'default') return;
    const source = osn.InputFactory.create(byOS({ [OS.Windows]: 'wasapi_input_capture', [OS.Mac]: 'coreaudio_input_capture' }), 'mic-audio', { device_id: metadata.device_id });
    setSetting('Output', `Track${currentTrack}Name`, metadata.name);
    source.audioMixers = 1 | (1 << currentTrack-1); // Bit mask to output to only tracks 1 and current track
    osn.Global.setOutputSource(currentTrack, source);
    currentTrack++;
  });

  setSetting('Output', 'RecTracks', parseInt('1'.repeat(currentTrack-1), 2)); // Bit mask of used tracks: 1111 to use first four (from available six)
}

function displayInfo() {
  const primaryDisplay = remote.screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { scaleFactor } = primaryDisplay;
  return {
    width,
    height,
    scaleFactor,
    aspectRatio: width / height,
    physicalWidth: width * scaleFactor,
    physicalHeight: height * scaleFactor
  };
}


const displayId = 'display1';

function setupPreview(window, bounds) {

  try{
  
    console.log(scene.getItems())
    console.log(scene, 'scene')
    const context = osn.VideoFactory.create()
    // console.log(context, context.video, remote.getCurrentWindow().getNativeWindowHandle())
  
  
    console.log(context)
    context.video = {
      fpsNum: 30,
      fpsDen: 1,
      baseWidth: 1080,
      baseHeight: 1920,
      outputWidth: 1080,
      outputHeight: 1920,
      outputFormat: 11,
    };
  
    // 采用createDisplay必备
    const defaultTransition = osn.TransitionFactory.create('cut_transition', "test_transition_a");
  
    defaultTransition.set(scene);
    osn.Global.setOutputSource(0, defaultTransition);
  
    // osn.NodeObs.OBS_content_createSourcePreviewDisplay(
    //   window.getNativeWindowHandle(),
    //   scene.name,
    //   displayId,
    //   false,
    //   context,
    // );
  
    osn.NodeObs.OBS_content_createDisplay(
      window.getNativeWindowHandle(),
      displayId,
      0,
      false,
      context,
    );
  
    osn.NodeObs.OBS_content_setShouldDrawUI(displayId, true);
    osn.NodeObs.OBS_content_setPaddingSize(displayId, 0);
    osn.NodeObs.OBS_content_setPaddingColor(displayId, 255, 255, 255);

    
  } catch(e) {
    console.log('display render over here error' + error)
  }

  // const {aspectRatio, scaleFactor} = displayInfo();
  
  // const displayWidth = Math.floor(bounds.width);
  // const displayHeight = Math.round(displayWidth / aspectRatio);
  // const displayX = Math.floor(bounds.x);
  // const displayY = Math.floor(bounds.y);

  // osn.NodeObs.OBS_content_resizeDisplay(displayId, displayWidth * scaleFactor, displayHeight * scaleFactor);
  // osn.NodeObs.OBS_content_moveDisplay(displayId, displayX * scaleFactor, displayY * scaleFactor);
  // return { height: displayHeight }

  // osn.NodeObs.OBS_content_createSourcePreviewDisplay(
  //   window.getNativeWindowHandle(),
  //   scene.name, // or use camera source Id here
  //   displayId,
  // );
  // osn.NodeObs.OBS_content_setShouldDrawUI(displayId, false);
  // osn.NodeObs.OBS_content_setPaddingSize(displayId, 0);
  // // Match padding color with main window background color
  // osn.NodeObs.OBS_content_setPaddingColor(displayId, 255, 255, 255);
  return resizePreview(window, bounds);
}
let existingWindow = false
let initY = 0
function resizePreview(window, bounds) {
  let { aspectRatio, scaleFactor } = displayInfo();
  console.log("aspectRatio : " + aspectRatio)
  console.log("scaleFactor : " + scaleFactor)
  if (getOS() === OS.Mac) {
    scaleFactor = 1
  }
  const displayWidth = Math.floor(bounds.width);
  const displayHeight = Math.round(displayWidth / aspectRatio);
  const displayX = Math.floor(bounds.x);
  const displayY = Math.floor(bounds.y);
  if (initY === 0) {
    initY = displayY
  }
  osn.NodeObs.OBS_content_resizeDisplay(displayId, displayWidth * scaleFactor, displayHeight * scaleFactor);

  if (getOS() === OS.Mac) {
    if (existingWindow) {
      nwr.destroyWindow(displayId);
      nwr.destroyIOSurface(displayId);
    }
    const surface = osn.NodeObs.OBS_content_createIOSurface(displayId)
    nwr.createWindow(
      displayId,
      window.getNativeWindowHandle(),
    );
    nwr.connectIOSurface(displayId, surface);
    nwr.moveWindow(displayId, displayX * scaleFactor, (initY - displayY + initY) * scaleFactor)
    existingWindow = true
  } else {
    osn.NodeObs.OBS_content_moveDisplay(displayId, displayX * scaleFactor, displayY * scaleFactor);
  }

  return { height: displayHeight }
}

function start() {
  if (!obsInitialized) initialize();

  let signalInfo;

  console.debug('Starting recording...');
  osn.NodeObs.OBS_service_startRecording();

  console.debug('Started?');
  signalInfo = getNextSignalInfo();

  if (signalInfo.signal === 'Stop') {
    throw Error(signalInfo.error);
    return { recording: false };
  }

  console.debug('Started signalInfo.type:', signalInfo.type, '(expected: "recording")');
  console.debug('Started signalInfo.signal:', signalInfo.signal, '(expected: "start")');
  console.debug('Started!');
  return { recording: false };
}

async function stop() {
  let signalInfo;

  console.debug('Stopping recording...');
  osn.NodeObs.OBS_service_stopRecording();
  console.debug('Stopped?');

  signalInfo = await getNextSignalInfo();

  console.debug('On stop signalInfo.type:', signalInfo.type, '(expected: "recording")');
  console.debug('On stop signalInfo.signal:', signalInfo.signal, '(expected: "stopping")');

  signalInfo = await getNextSignalInfo();

  console.debug('After stop signalInfo.type:', signalInfo.type, '(expected: "recording")');
  console.debug('After stop signalInfo.signal:', signalInfo.signal, '(expected: "stop")');

  console.debug('Stopped!');
  return { recording: false };
}

function shutdown() {
  if (!obsInitialized) {
    console.debug('OBS is already shut down!');
    return false;
  }

  console.debug('Shutting down OBS...');

  try {
    // if (isVirtualCamPluginInstalled()){
    //   osn.NodeObs.OBS_service_uninstallVirtualCamPlugin();
    // }
    osn.NodeObs.OBS_service_removeCallback();
    osn.NodeObs.IPC.disconnect();
    obsInitialized = false;
  } catch(e) {
    throw Error('Exception when shutting down OBS process' + e);
  }

  console.debug('OBS shutdown successfully');

  return true;
}

function setSetting(category, parameter, value) {
  let oldValue;

  // Getting settings container
  const settings = osn.NodeObs.OBS_settings_getSettings(category).data;

  settings.forEach(subCategory => {
    subCategory.parameters.forEach(param => {
      if (param.name === parameter) {
        oldValue = param.currentValue;
        param.currentValue = value;
      }
    });
  });

  // Saving updated settings container
  if (value != oldValue) {
    osn.NodeObs.OBS_settings_saveSettings(category, settings);
  }
}

function getAvailableValues(category, subcategory, parameter) {
  const categorySettings = osn.NodeObs.OBS_settings_getSettings(category).data;
  if (!categorySettings) {
    console.warn(`There is no category ${category} in OBS settings`);
    return [];
  }

  const subcategorySettings = categorySettings.find(sub => sub.nameSubCategory === subcategory);
  if (!subcategorySettings) {
    console.warn(`There is no subcategory ${subcategory} for OBS settings category ${category}`);
    return [];
  }

  const parameterSettings = subcategorySettings.parameters.find(param => param.name === parameter);
  if (!parameterSettings) {
    console.warn(`There is no parameter ${parameter} for OBS settings category ${category}.${subcategory}`);
    return [];
  }

  return parameterSettings.values.map( value => Object.values(value)[0]);
}

const signals = new Subject();

function getNextSignalInfo() {
  return new Promise((resolve, reject) => {
    signals.pipe(first()).subscribe(signalInfo => resolve(signalInfo));
    setTimeout(() => reject('Output signal timeout'), 30000);
  });
}

function busySleep(sleepDuration) {
  var now = new Date().getTime();
  while(new Date().getTime() < now + sleepDuration) { /* do nothing */ };
}

module.exports.initialize = initialize;
module.exports.start = start;
module.exports.isVirtualCamPluginInstalled = isVirtualCamPluginInstalled;
module.exports.installVirtualCamPlugin = installVirtualCamPlugin;
module.exports.uninstallVirtualCamPlugin = uninstallVirtualCamPlugin;
module.exports.startVirtualCam = startVirtualCam;
module.exports.stopVirtualCam = stopVirtualCam;
module.exports.stop = stop;
module.exports.shutdown = shutdown;
module.exports.setupPreview = setupPreview;
module.exports.resizePreview = resizePreview;
