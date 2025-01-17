/**
 * glance2 big brains
 * 
 * this code uses:
 * - absolutely no jQuery (yes it's possible o.o)
 */

/** --- BEGIN CONFIGURATION --- */

/**
 * getSocketUrl is a factory that should be extended to locate your
 * glance API server.
 * 
 * If you are running glance out-of-box, the frontend will be served from the
 * same host as the API, so this will work fine. You also won't have to worry
 * about ws-on-https security breakage. 
 * 
 * Otherwise, this will need to be changed to reflect your API server.
 */
function getSocketUrl() {
  if (window.config && 'url' in window.config) {
    return window.config.url;
  }

  let protocol = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
  return protocol + window.location.host + '/api/feed';
}

/** --- END CONFIGURATION --- */

let version = "glance2-f.1.3 // by foxbot";

/** @type Element */
let dataConnectionStatus;
/** @type Element */
let appMount;
/** @type Element */
let appClusterMount;
/** @type Element */
let loadingMount;
/** @type Element */
let settingsMount;
/** @type Element */
let guildFinderMount;

/** @type WebSocket */
let feed;

let state;
let pulseHealth = true;

function init() {
  console.log('glance// initializing.');
  dataConnectionStatus = document.querySelector('#data-connection-status');
  dataConnectionStatus.textContent = '(js loaded)';

  if (window.config && 'branding' in window.config) {
    document.querySelector('#header-brand').innerHTML = window.config.branding;
  }

  appMount = document.querySelector('#app');
  appClusterMount = document.querySelector('#app-cluster')
  loadingMount = document.querySelector('#loading');
  settingsMount = document.querySelector('#settings');

  feed = new WebSocket(getSocketUrl());

  feed.addEventListener('open', feedOpen);
  feed.addEventListener('close', feedClose);
  feed.addEventListener('message', feedMessage);
  feed.addEventListener('error', feedError);

  guildFinderMount = document.querySelector('#header-guild');
  guildFinderMount.addEventListener('input', event => {
    findGuilds();
  });

  document.querySelector('#settings-open').addEventListener('click', event => {
    settingsMount.classList.remove('hide');
  });
  document.querySelector('#settings-close').addEventListener('click', event => {
    settingsMount.classList.add('hide');
  });

  if (!localStorage.getItem('pulse_health')) {
    localStorage.setItem('pulse_health', true);
    pulseHealth = true;
  } else {
    pulseHealth = localStorage.getItem('pulse_health') === 'true';
    localStorage.setItem('pulse-health', pulseHealth);
  }
  const settingsPulseHealth = document.querySelector('#settings-pulse-health');
  settingsPulseHealth.setAttribute('data-checked', pulseHealth);
  settingsPulseHealth.addEventListener('click', event => {
    pulseHealth = !pulseHealth;
    settingsPulseHealth.setAttribute('data-checked', pulseHealth);
  });

  document.querySelector('#settings-glance-version').innerText = version;
}

function feedOpen(_) {
  dataConnectionStatus.textContent = 'connected';
  
  loadingMount.classList.add('hide');
  appMount.classList.remove('hide');
  guildFinderMount.classList.remove('hide');
}
function feedClose(_) {
  dataConnectionStatus.textContent = 'disconnected, reload.';

  appMount.classList.add('hide');
  guildFinderMount.classList.add('hide');
  loadingMount.classList.remove('hide');

  // TODO: reconnection logic
}
function feedError(error) {
  dataConnectionStatus.textContent = 'socket error, reload or see console.';
  console.error(error)
}
/** @param {MessageEvent} event */
function feedMessage(event) {
  const data = JSON.parse(event.data);
  if (!'op' in data) {
    console.error('event arrived without opcode');
    return;
  }
  switch (data.op) {
    case 'hello': {
      hello(data.payload);
      break;
    }
    case 'state_update': {
      update(data.payload);
      break;
    }
    case 'health_ping': {
      health(data.payload);
      break;
    }
    default: {
      console.error('unhandled opcode: \'' + data.op + '\'');
    }
  }
}

function hello(data) {
  reset();
  state = {}

  // initial render
  for (let cluster in data) {
    state[cluster] = {};
    
    const clusterEl = document.createElement('div');
    clusterEl.classList.add('cluster');
    
    const clusterTitle = document.createElement('p');
    clusterTitle.textContent = cluster;
    clusterTitle.classList.add('cluster-title');

    const clusterContainer = document.createElement('div');
    clusterContainer.classList.add('cluster-container');

    clusterEl.appendChild(clusterTitle);
    clusterEl.appendChild(clusterContainer);

    const shardsPerCluster = (window.config && 'clusters' in window.config) ? window.config.clusters : 1;
    const shardCount = data[cluster]['len'];

    let clusterId = 0;
    for (let shardStart = 0; shardStart <= shardCount; shardStart += shardsPerCluster) {
      shardStart = Math.min(shardStart, shardCount);
      const shardEnd = Math.min(shardStart + shardsPerCluster, shardCount);

      if (shardCount <= shardStart) {
        break;
      }

      const shardCluster = document.createElement('div');
      shardCluster.classList.add('shard-cluster');

      const shardClusterTitle = document.createElement('p');
      shardClusterTitle.classList.add('shard-cluster-title');
      shardClusterTitle.textContent = `c${clusterId}`;
      shardCluster.appendChild(shardClusterTitle);

      const shardClusterGroup = document.createElement('div');
      shardClusterGroup.classList.add('shards');
      shardCluster.appendChild(shardClusterGroup);

      clusterContainer.appendChild(shardCluster);

      for (let shardId = shardStart; shardId < shardEnd; shardId++) {
        const shard = document.createElement('div');
        shard.classList.add('shard');
        shard.setAttribute('data-status', '0');

        const id = String(shardId);
        if (id in data[cluster]) {
          //console.log(data[cluster][id]);
          shard.setAttribute('data-status', data[cluster][id]['state']);
        }

        const shardText = document.createElement('p');
        shardText.classList.add('shard-id');
        shardText.textContent = id;

        shard.appendChild(shardText);

        shardClusterGroup.appendChild(shard);
        state[cluster][id] = shard;
      }

      clusterId++;
    }

    appClusterMount.appendChild(clusterEl);
    state[cluster]['el'] = clusterEl;
  }
}

function update(data) {
  if (!data.cluster in state) {
    console.error('invalid data received for current state (cluster not found)', data);
    return;
  }
  if (!data.shard in state[data.cluster]) {
    console.error('invalid data received for current state (shard not found)', data);
    return;
  }
  state[data.cluster][data.shard].setAttribute('data-status', data.state.toString());
}

function health(data) {
  if (!data.cluster in state) {
    console.error('invalid data received for current state (cluster not found)', data);
    return;
  }
  if (!data.shard in state[data.cluster]) {
    console.error('invalid data received for current state (shard not found)', data);
    return;
  }

  let el = state[data.cluster][data.shard];

  if ('state' in data) {
    el.setAttribute('data-status', data.state.toString());
  }

  if (!pulseHealth) {
    return;
  }

  el.classList.add('health-ping');

  setTimeout(function() {
    el.classList.remove('health-ping');
  }, 2500);
}

function reset() {
  while (appClusterMount.lastChild) {
    appMount.removeChild(appMount.lastChild);
  }
}

const RightShift = 4194304;
let taggedGuilds = [];
function findGuilds() {
  for (let tagged of taggedGuilds) {
    if (tagged.classList.contains('guild-tagged')) {
      tagged.classList.remove('guild-tagged');
    }
  }
  taggedGuilds = [];

  let id = +guildFinderMount.value;
  if (id === 0) {
    return;
  }

  let discrim = Math.floor(id / RightShift);
  for (let cluster in state) {
    let shards = Object.keys(state[cluster]).length - 1;
    let shard = discrim % shards;
    let el = state[cluster][shard];
    el.classList.add('guild-tagged');
    taggedGuilds.push(el);
  }
}

// --- script all loaded
init();