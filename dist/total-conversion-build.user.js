// ==UserScript==
// @id             ingress-intel-total-conversion@breunigs
// @name           intel map total conversion
// @version        0.6-2013-02-19-211222
// @namespace      https://github.com/breunigs/ingress-intel-total-conversion
// @updateURL      https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/dist/total-conversion-build.user.js
// @downloadURL    https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/dist/total-conversion-build.user.js
// @description    total conversion for the ingress intel map.
// @include        http://www.ingress.com/intel*
// @match          http://www.ingress.com/intel*
// ==/UserScript==


// REPLACE ORIG SITE ///////////////////////////////////////////////////
if(document.getElementsByTagName('html')[0].getAttribute('itemscope') != null)
  throw('Ingress Intel Website is down, not a userscript issue.');

// disable vanilla JS
window.onload = function() {};

// rescue user data from original page
var scr = document.getElementsByTagName('script');
for(var x in scr) {
  var s = scr[x];
  if(s.src) continue;
  if(s.type !== 'text/javascript') continue;
  var d = s.innerHTML.split('\n');
  break;
}


if(!d) {
  // page doesn’t have a script tag with player information.
  if(document.getElementById('header_email')) {
    // however, we are logged in.
    setTimeout('location.reload();', 10*1000);
    throw('Page doesn’t have player data, but you are logged in. Reloading in 10s.');
  }
  // FIXME: handle nia takedown in progress
  throw('Couldn’t retrieve player data. Are you logged in?');
}


for(var i = 0; i < d.length; i++) {
  if(!d[i].match('var PLAYER = ')) continue;
  eval(d[i].match(/^var /, 'window.'));
  break;
}
// player information is now available in a hash like this:
// window.PLAYER = {"ap": "123", "energy": 123, "available_invites": 123, "nickname": "somenick", "team": "ALIENS||RESISTANCE"};

var ir = window.internalResources || [];

var mainstyle = 'http://breunigs.github.com/ingress-intel-total-conversion/style.css?2013-02-19-211222';
var smartphone = 'http://breunigs.github.com/ingress-intel-total-conversion/smartphone.css?2013-02-19-211222';
var leaflet = 'http://cdn.leafletjs.com/leaflet-0.5/leaflet.css';
var coda = 'http://fonts.googleapis.com/css?family=Coda';

// remove complete page. We only wanted the user-data and the page’s
// security context so we can access the API easily. Setup as much as
// possible without requiring scripts.
document.getElementsByTagName('head')[0].innerHTML = ''
  //~ + '<link rel="stylesheet" type="text/css" href="http://0.0.0.0:8000/style.css"/>'
  + '<title>Ingress Intel Map</title>'
  + (ir.indexOf('mainstyle') === -1
      ? '<link rel="stylesheet" type="text/css" href="'+mainstyle+'"/>'
      : '')
  + (ir.indexOf('leafletcss') === -1
      ? '<link rel="stylesheet" type="text/css" href="'+leaflet+'"/>'
      : '')
  // this navigator check is also used in code/smartphone.js
  + (ir.indexOf('smartphonecss') === -1 && navigator.userAgent.match(/Android.*Mobile/)
      ? '<link rel="stylesheet" type="text/css" href="'+smartphone+'"/>'
      : '')
  + (ir.indexOf('codafont') === -1
      ? '<link rel="stylesheet" type="text/css" href="'+coda+'"/>'
      : '');

document.getElementsByTagName('body')[0].innerHTML = ''
  + '<div id="map">Loading, please wait</div>'
  + '<div id="chatcontrols" style="display:none">'
  + '  <a><span class="toggle expand"></span></a>'
  +   '<a>full</a><a>compact</a><a>public</a><a class="active">faction</a>'
  + '</div>'
  + '<div id="chat" style="display:none">'
  + '  <div id="chatfaction"></div>'
  + '  <div id="chatpublic"></div>'
  + '  <div id="chatcompact"></div>'
  + '  <div id="chatfull"></div>'
  + '</div>'
  + '<form id="chatinput" style="display:none"><table><tr>'
  + '  <td><time></time></td>'
  + '  <td><mark>tell faction:</mark></td>'
  + '  <td><input type="text"/></td>'
  + '</tr></table></form>'
  + '<a id="sidebartoggle"><span class="toggle close"></span></a>'
  + '<div id="scrollwrapper">' // enable scrolling for small screens
  + '  <div id="sidebar" style="display: none">'
  + '    <input id="geosearch" placeholder="Search location…" type="text"/>'
  + '    <div id="portaldetails"></div>'
  + '    <input id="redeem" placeholder="Redeem code…" type="text"/>'
  + '    <div id="toolbox">'
  + '      <a onmouseover="setPermaLink(this)">permalink</a>'
  + '      <a href="https://github.com/breunigs/ingress-intel-total-conversion#readme" title="IITC = Ingress Intel Total Conversion.\n\nOn the script’s homepage you can:\n– find updates\n– get plugins\n– report bugs\n– and contribute." style="cursor: help">IITC’s page</a></div>'
  + '  </div>'
  + '</div>'
  + '<div id="updatestatus"></div>';

// putting everything in a wrapper function that in turn is placed in a
// script tag on the website allows us to execute in the site’s context
// instead of in the Greasemonkey/Extension/etc. context.
function wrapper() {

// LEAFLET PREFER CANVAS ///////////////////////////////////////////////
// Set to true if Leaflet should draw things using Canvas instead of SVG
// Disabled for now because it has several bugs: flickering, constant
// CPU usage and it continuously fires the moveend event.
L_PREFER_CANVAS = false;

// CONFIG OPTIONS ////////////////////////////////////////////////////
window.REFRESH = 30; // refresh view every 30s (base time)
window.ZOOM_LEVEL_ADJ = 5; // add 5 seconds per zoom level
window.REFRESH_GAME_SCORE = 5*60; // refresh game score every 5 minutes
window.MAX_IDLE_TIME = 4; // stop updating map after 4min idling
window.PRECACHE_PLAYER_NAMES_ZOOM = 17; // zoom level to start pre-resolving player names
window.HIDDEN_SCROLLBAR_ASSUMED_WIDTH = 20;
window.SIDEBAR_WIDTH = 300;
// chat messages are requested for the visible viewport. On high zoom
// levels this gets pretty pointless, so request messages in at least a
// X km radius.
window.CHAT_MIN_RANGE = 35;
// this controls how far data is being drawn outside the viewport. Set
// it 0 to only draw entities that intersect the current view. A value
// of one will render an area twice the size of the viewport (or some-
// thing like that, Leaflet doc isn’t too specific). Setting it too low
// makes the missing data on move/zoom out more obvious. Setting it too
// high causes too many items to be drawn, making drag&drop sluggish.
window.VIEWPORT_PAD_RATIO = 0.3;

// how many items to request each query
window.CHAT_PUBLIC_ITEMS = 200;
window.CHAT_FACTION_ITEMS = 50;
// how many pixels to the top before requesting new data
window.CHAT_REQUEST_SCROLL_TOP = 200;
window.CHAT_SHRINKED = 60;

// Leaflet will get very slow for MANY items. It’s better to display
// only some instead of crashing the browser.
window.MAX_DRAWN_PORTALS = 1000;
window.MAX_DRAWN_LINKS = 400;
window.MAX_DRAWN_FIELDS = 200;
// Minimum zoom level resonator will display
window.RESONATOR_DISPLAY_ZOOM_LEVEL = 18;

window.COLOR_SELECTED_PORTAL = '#f00';
window.COLORS = ['#FFCE00', '#0088FF', '#03FE03']; // none, res, enl
window.COLORS_LVL = ['#000', '#FECE5A', '#FFA630', '#FF7315', '#E40000', '#FD2992', '#EB26CD', '#C124E0', '#9627F4'];
window.COLORS_MOD = {VERY_RARE: '#F78AF6', RARE: '#AD8AFF', COMMON: '#84FBBD'};

window.OPTIONS_RESONATOR_SELECTED = { color: '#fff', weight: 2, radius: 4};
window.OPTIONS_RESONATOR_NON_SELECTED = { color: '#aaa', weight: 1, radius: 3};

window.OPTIONS_RESONATOR_LINE_SELECTED = {opacity: 0.7, weight: 3};
window.OPTIONS_RESONATOR_LINE_NON_SELECTED = {opacity: 0.25, weight: 2};

// circles around a selected portal that show from where you can hack
// it and how far the portal reaches (i.e. how far links may be made
// from this portal)
window.ACCESS_INDICATOR_COLOR = 'orange';
window.RANGE_INDICATOR_COLOR = 'red'

// by how much pixels should the portal range be expanded on mobile
// devices. This should make clicking them easier.
window.PORTAL_RADIUS_ENLARGE_MOBILE = 5;


window.DEFAULT_PORTAL_IMG = 'http://commondatastorage.googleapis.com/ingress/img/default-portal-image.png';
window.NOMINATIM = 'http://nominatim.openstreetmap.org/search?format=json&limit=1&q=';

// INGRESS CONSTANTS /////////////////////////////////////////////////
// http://decodeingress.me/2012/11/18/ingress-portal-levels-and-link-range/
var RESO_NRG = [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000];
var MAX_XM_PER_LEVEL = [0, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
var MIN_AP_FOR_LEVEL = [0, 10000, 30000, 70000, 150000, 300000, 600000, 1200000];
var HACK_RANGE = 40; // in meters, max. distance from portal to be able to access it
var OCTANTS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
var DESTROY_RESONATOR = 75; //AP for destroying portal
var DESTROY_LINK = 187; //AP for destroying link
var DESTROY_FIELD = 750; //AP for destroying field
var CAPTURE_PORTAL = 500; //AP for capturing a portal
var DEPLOY_RESONATOR = 125; //AP for deploying a resonator
var COMPLETION_BONUS = 250; //AP for deploying all resonators on portal

// OTHER MORE-OR-LESS CONSTANTS //////////////////////////////////////
var TEAM_NONE = 0, TEAM_RES = 1, TEAM_ENL = 2;
var TEAM_TO_CSS = ['none', 'res', 'enl'];
var TYPE_UNKNOWN = 0, TYPE_PORTAL = 1, TYPE_LINK = 2, TYPE_FIELD = 3, TYPE_PLAYER = 4, TYPE_CHAT = 5, TYPE_RESONATOR = 6;

var SLOT_TO_LAT = [0, Math.sqrt(2)/2, 1, Math.sqrt(2)/2, 0, -Math.sqrt(2)/2, -1, -Math.sqrt(2)/2];
var SLOT_TO_LNG = [1, Math.sqrt(2)/2, 0, -Math.sqrt(2)/2, -1, -Math.sqrt(2)/2, 0, Math.sqrt(2)/2];
var EARTH_RADIUS=6378137;
var DEG2RAD = Math.PI / 180;

// STORAGE ///////////////////////////////////////////////////////////
// global variables used for storage. Most likely READ ONLY. Proper
// way would be to encapsulate them in an anonymous function and write
// getters/setters, but if you are careful enough, this works.
var refreshTimeout;
var urlPortal = null;
window.playersToResolve = [];
window.playersInResolving = [];
window.selectedPortal = null;
window.portalRangeIndicator = null;
window.portalAccessIndicator = null;
window.mapRunsUserAction = false;
var portalsLayers, linksLayer, fieldsLayer;

// contain references to all entities shown on the map. These are
// automatically kept in sync with the items on *sLayer, so never ever
// write to them.
window.portals = {};
window.links = {};
window.fields = {};
window.resonators = {};

// plugin framework. Plugins may load earlier than iitc, so don’t
// overwrite data
if(typeof window.plugin !== 'function') window.plugin = function() {};






// SETUP /////////////////////////////////////////////////////////////
// these functions set up specific areas after the boot function
// created a basic framework. All of these functions should only ever
// be run once.

window.setupLargeImagePreview = function() {
  $('#portaldetails').on('click', '.imgpreview', function() {
    var ex = $('#largepreview');
    if(ex.length > 0) {
      ex.remove();
      return;
    }
    var img = $(this).find('img')[0];
    var w = img.naturalWidth/2;
    var h = img.naturalHeight/2;
    var c = $('#portaldetails').attr('class');
    $('body').append(
      '<div id="largepreview" class="'+c+'" style="margin-left: '+(-SIDEBAR_WIDTH/2-w-2)+'px; margin-top: '+(-h-2)+'px">' + img.outerHTML + '</div>'
    );
    $('#largepreview').click(function() { $(this).remove() });
  });
}


window.setupStyles = function() {
  $('head').append('<style>' +
    [ '#largepreview.enl img { border:2px solid '+COLORS[TEAM_ENL]+'; } ',
      '#largepreview.res img { border:2px solid '+COLORS[TEAM_RES]+'; } ',
      '#largepreview.none img { border:2px solid '+COLORS[TEAM_NONE]+'; } ',
      '#chatcontrols { bottom: '+(CHAT_SHRINKED+22)+'px; }',
      '#chat { height: '+CHAT_SHRINKED+'px; } ',
      '.leaflet-right { margin-right: '+(SIDEBAR_WIDTH+1)+'px } ',
      '#updatestatus { width:'+(SIDEBAR_WIDTH+2)+'px;  } ',
      '#sidebar { width:'+(SIDEBAR_WIDTH + HIDDEN_SCROLLBAR_ASSUMED_WIDTH + 1 /*border*/)+'px;  } ',
      '#sidebartoggle { right:'+(SIDEBAR_WIDTH+1)+'px;  } ',
      '#scrollwrapper  { width:'+(SIDEBAR_WIDTH + 2*HIDDEN_SCROLLBAR_ASSUMED_WIDTH)+'px; right:-'+(2*HIDDEN_SCROLLBAR_ASSUMED_WIDTH-2)+'px } ',
      '#sidebar > * { width:'+(SIDEBAR_WIDTH+1)+'px;  }'].join("\n")
    + '</style>');
}

window.setupMap = function() {
  $('#map').text('');

  var osmOpt = {attribution: 'Map data © OpenStreetMap contributors', maxZoom: 18};
  var osm = new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', osmOpt);

  var cmOpt = {attribution: 'Map data © OpenStreetMap contributors, Imagery © CloudMade', maxZoom: 18};
  var cmMin = new L.TileLayer('http://{s}.tile.cloudmade.com/654cef5fd49a432ab81267e200ecc502/22677/256/{z}/{x}/{y}.png', cmOpt);
  var cmMid = new L.TileLayer('http://{s}.tile.cloudmade.com/654cef5fd49a432ab81267e200ecc502/999/256/{z}/{x}/{y}.png', cmOpt);

  var views = [cmMid, cmMin, osm, new L.Google('INGRESS'), new L.Google('ROADMAP'),
               new L.Google('SATELLITE'), new L.Google('HYBRID')];


  window.map = new L.Map('map', $.extend(getPosition(),
    {zoomControl: !(localStorage['iitc.zoom.buttons'] === 'false')}
  ));

  try {
    map.addLayer(views[readCookie('ingress.intelmap.type')]);
  } catch(e) { map.addLayer(views[0]); }

  var addLayers = {};

  portalsLayers = [];
  for(var i = 0; i <= 8; i++) {
    portalsLayers[i] = L.layerGroup([]);
    map.addLayer(portalsLayers[i]);
    var t = (i === 0 ? 'Unclaimed' : 'Level ' + i) + ' Portals';
    addLayers[t] = portalsLayers[i];
  }

  fieldsLayer = L.layerGroup([]);
  map.addLayer(fieldsLayer, true);
  addLayers['Fields'] = fieldsLayer;

  linksLayer = L.layerGroup([]);
  map.addLayer(linksLayer, true);
  addLayers['Links'] = linksLayer;

  window.layerChooser = new L.Control.Layers({
    'OSM Cloudmade Midnight': views[0],
    'OSM Cloudmade Minimal': views[1],
    'OSM Mapnik': views[2],
    'Google Roads Ingress Style': views[3],
    'Google Roads':  views[4],
    'Google Satellite':  views[5],
    'Google Hybrid':  views[6]
    }, addLayers);

  map.addControl(window.layerChooser);
  map.attributionControl.setPrefix('');
  // listen for changes and store them in cookies
  map.on('moveend', window.storeMapPosition);
  map.on('zoomend', function() {
    window.storeMapPosition();

    // remove all resonators if zoom out to < RESONATOR_DISPLAY_ZOOM_LEVEL
    if(isResonatorsShow()) return;
    for(var i = 1; i < portalsLayers.length; i++) {
      portalsLayers[i].eachLayer(function(item) {
        var itemGuid = item.options.guid;
        // check if 'item' is a resonator
        if(getTypeByGuid(itemGuid) != TYPE_RESONATOR) return true;
        portalsLayers[i].removeLayer(item);
      });
    }

    console.log('Remove all resonators');
  });

  map.on('baselayerchange', function () {
    var selInd = $('[name=leaflet-base-layers]:checked').parent().index();
    writeCookie('ingress.intelmap.type', selInd);
  });

  // map update status handling
  map.on('movestart zoomstart', function() { window.mapRunsUserAction = true });
  map.on('moveend zoomend', function() { window.mapRunsUserAction = false });

  // update map hooks
  map.on('movestart zoomstart', window.requests.abort);
  map.on('moveend zoomend', function() { window.startRefreshTimeout(500) });

  // run once on init
  window.requestData();
  window.startRefreshTimeout();

  window.addResumeFunction(window.requestData);
  window.requests.addRefreshFunction(window.requestData);
};

// renders player details into the website. Since the player info is
// included as inline script in the original site, the data is static
// and cannot be updated.
window.setupPlayerStat = function() {
  var level;
  var ap = parseInt(PLAYER.ap);
  for(level = 0; level < MIN_AP_FOR_LEVEL.length; level++) {
    if(ap < MIN_AP_FOR_LEVEL[level]) break;
  }

  var thisLvlAp = MIN_AP_FOR_LEVEL[level-1];
  var nextLvlAp = MIN_AP_FOR_LEVEL[level] || ap;
  var lvlUpAp = digits(nextLvlAp-ap);
  var lvlApProg = Math.round((ap-thisLvlAp)/(nextLvlAp-thisLvlAp)*100);


  var xmMax = MAX_XM_PER_LEVEL[level];
  var xmRatio = Math.round(PLAYER.energy/xmMax*100);

  var cls = PLAYER.team === 'ALIENS' ? 'enl' : 'res';


  var t = 'Level:\t' + level + '\n'
        + 'XM:\t' + PLAYER.energy + ' / ' + xmMax + '\n'
        + 'AP:\t' + digits(ap) + '\n'
        + (level < 8 ? 'level up in:\t' + lvlUpAp + ' AP' : 'Congrats! (neeeeerd)')
        + '\n\Invites:\t'+PLAYER.available_invites;
        + '\n\nNote: your player stats can only be updated by a full reload (F5)';

  $('#playerstat').html(''
    + '<h2 title="'+t+'">'+level+'&nbsp;'
    + '<span class="'+cls+'">'+PLAYER.nickname+'</span>'
    + '<div>'
    + '<sup>XM: '+xmRatio+'%</sup>'
    + '<sub>' + (level < 8 ? 'level: '+lvlApProg+'%' : 'max level') + '</sub>'
    + '</div>'
    + '</h2>'
  );
}

window.setupSidebarToggle = function() {
  $('#sidebartoggle').on('click', function() {
    var toggle = $('#sidebartoggle');
    var sidebar = $('#scrollwrapper');
    if(sidebar.is(':visible')) {
      sidebar.hide().css('z-index', 1);
      $('.leaflet-right').css('margin-right','0');
      toggle.html('<span class="toggle open"></span>');
      toggle.css('right', '0');
    } else {
      sidebar.css('z-index', 1001).show();
      $('.leaflet-right').css('margin-right', SIDEBAR_WIDTH+1+'px');
      toggle.html('<span class="toggle close"></span>');
      toggle.css('right', SIDEBAR_WIDTH+1+'px');
    }
  });
}

window.setupTooltips = function(element) {
  element = element || $(document);
  element.tooltip({
    // disable show/hide animation
    show: { effect: "hide", duration: 0 } ,
    hide: false,
    open: function(event, ui) {
      ui.tooltip.delay(300).fadeIn(0);
    },
    content: function() {
      var title = $(this).attr('title');

      // check if it should be converted to a table
      if(!title.match(/\t/)) {
        return title.replace(/\n/g, '<br />');
      }

      var data = [];
      var columnCount = 0;

      // parse data
      var rows = title.split('\n');
      $.each(rows, function(i, row) {
        data[i] = row.split('\t');
        if(data[i].length > columnCount) columnCount = data[i].length;
      });

      // build the table
      var tooltip = '<table>';
      $.each(data, function(i, row) {
        tooltip += '<tr>';
        $.each(data[i], function(k, cell) {
          var attributes = '';
          if(k === 0 && data[i].length < columnCount) {
            attributes = ' colspan="'+(columnCount - data[i].length + 1)+'"';
          }
          tooltip += '<td'+attributes+'>'+cell+'</td>';
        });
        tooltip += '</tr>';
      });
      tooltip += '</table>';
      return tooltip;
    }
  });

  if(!window.tooltipClearerHasBeenSetup) {
    window.tooltipClearerHasBeenSetup = true;
    $(document).on('click', '.ui-tooltip', function() { $(this).remove(); });
  }
}


// BOOTING ///////////////////////////////////////////////////////////

function boot() {
  window.debug.console.overwriteNativeIfRequired();

  console.log('loading done, booting');
  window.runOnSmartphonesBeforeBoot();

  // overwrite default Leaflet Marker icon to be a neutral color
  var base = 'http://breunigs.github.com/ingress-intel-total-conversion/dist/images/';
  L.Icon.Default.imagePath = base;

  window.iconEnl = L.Icon.Default.extend({options: { iconUrl: base + 'marker-green.png' } });
  window.iconRes = L.Icon.Default.extend({options: { iconUrl: base + 'marker-blue.png' } });

  window.setupStyles();
  window.setupMap();
  window.setupGeosearch();
  window.setupRedeem();
  window.setupLargeImagePreview();
  window.setupSidebarToggle();
  window.updateGameScore();
  window.setupPlayerStat();
  window.setupTooltips();
  window.chat.setup();
  // read here ONCE, so the URL is only evaluated one time after the
  // necessary data has been loaded.
  urlPortal = getURLParam('pguid');

  // load only once
  var n = window.PLAYER['nickname'];
  window.PLAYER['nickMatcher'] = new RegExp('\\b('+n+')\\b', 'ig');

  $('#sidebar').show();

  if(window.bootPlugins)
    $.each(window.bootPlugins, function(ind, ref) { ref(); });

  // sidebar is now at final height. Adjust scrollwrapper so scrolling
  // is possible for small screens and it doesn’t block the area below
  // it.
  $('#scrollwrapper').css('max-height', ($('#sidebar').get(0).scrollHeight+3) + 'px');

  window.runOnSmartphonesAfterBoot();

  // workaround for #129. Not sure why this is required.
  setTimeout('window.map.invalidateSize(false);', 500);

  window.iitcLoaded = true;
}

// this is the minified load.js script that allows us to easily load
// further javascript files async as well as in order.
// https://github.com/chriso/load.js
// Copyright (c) 2010 Chris O'Hara <cohara87@gmail.com>. MIT Licensed
function asyncLoadScript(a){return function(b,c){var d=document.createElement("script");d.type="text/javascript",d.src=a,d.onload=b,d.onerror=c,d.onreadystatechange=function(){var a=this.readyState;if(a==="loaded"||a==="complete")d.onreadystatechange=null,b()},head.insertBefore(d,head.firstChild)}}(function(a){a=a||{};var b={},c,d;c=function(a,d,e){var f=a.halt=!1;a.error=function(a){throw a},a.next=function(c){c&&(f=!1);if(!a.halt&&d&&d.length){var e=d.shift(),g=e.shift();f=!0;try{b[g].apply(a,[e,e.length,g])}catch(h){a.error(h)}}return a};for(var g in b){if(typeof a[g]=="function")continue;(function(e){a[e]=function(){var g=Array.prototype.slice.call(arguments);if(e==="onError"){if(d)return b.onError.apply(a,[g,g.length]),a;var h={};return b.onError.apply(h,[g,g.length]),c(h,null,"onError")}return g.unshift(e),d?(a.then=a[e],d.push(g),f?a:a.next()):c({},[g],e)}})(g)}return e&&(a.then=a[e]),a.call=function(b,c){c.unshift(b),d.unshift(c),a.next(!0)},a.next()},d=a.addMethod=function(d){var e=Array.prototype.slice.call(arguments),f=e.pop();for(var g=0,h=e.length;g<h;g++)typeof e[g]=="string"&&(b[e[g]]=f);--h||(b["then"+d.substr(0,1).toUpperCase()+d.substr(1)]=f),c(a)},d("chain",function(a){var b=this,c=function(){if(!b.halt){if(!a.length)return b.next(!0);try{null!=a.shift().call(b,c,b.error)&&c()}catch(d){b.error(d)}}};c()}),d("run",function(a,b){var c=this,d=function(){c.halt||--b||c.next(!0)},e=function(a){c.error(a)};for(var f=0,g=b;!c.halt&&f<g;f++)null!=a[f].call(c,d,e)&&d()}),d("defer",function(a){var b=this;setTimeout(function(){b.next(!0)},a.shift())}),d("onError",function(a,b){var c=this;this.error=function(d){c.halt=!0;for(var e=0;e<b;e++)a[e].call(c,d)}})})(this);var head=document.getElementsByTagName("head")[0]||document.documentElement;addMethod("load",function(a,b){for(var c=[],d=0;d<b;d++)(function(b){c.push(asyncLoadScript(a[b]))})(d);this.call("run",c)})


// modified version of https://github.com/shramov/leaflet-plugins. Also
// contains the default Ingress map style.
var LEAFLETGOOGLE = 'http://breunigs.github.com/ingress-intel-total-conversion/dist/leaflet_google.js';
var JQUERY = 'https://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js';
var JQUERYUI = 'http://ajax.googleapis.com/ajax/libs/jqueryui/1.10.0/jquery-ui.min.js';
var LEAFLET = 'http://cdn.leafletjs.com/leaflet-0.5/leaflet.js';
var AUTOLINK = 'http://breunigs.github.com/ingress-intel-total-conversion/dist/autolink.js';
var EMPTY = 'data:text/javascript;base64,';

// don’t download resources which have been injected already
var ir = window && window.internalResources ? window.internalResources : [];
if(ir.indexOf('jquery')        !== -1) JQUERY   = EMPTY;
if(ir.indexOf('jqueryui')      !== -1) JQUERYUI = EMPTY;
if(ir.indexOf('leaflet')       !== -1) LEAFLET  = EMPTY;
if(ir.indexOf('autolink')      !== -1) AUTOLINK = EMPTY;
if(ir.indexOf('leafletgoogle') !== -1) LEAFLETGOOGLE = EMPTY;


// after all scripts have loaded, boot the actual app
load(JQUERY, LEAFLET, AUTOLINK).then(LEAFLETGOOGLE, JQUERYUI).onError(function (err) {
  alert('Could not all resources, the script likely won’t work.\n\nIf this happend the first time for you, it’s probably a temporary issue. Just wait a bit and try again.\n\nIf you installed the script for the first time and this happens:\n– try disabling NoScript if you have it installed\n– press CTRL+SHIFT+K in Firefox or CTRL+SHIFT+I in Chrome/Opera and reload the page. Additional info may be available in the console.\n– Open an issue at https://github.com/breunigs/ingress-intel-total-conversion/issues');
}).thenRun(boot);


window.chat = function() {};

window.chat.handleTabCompletion = function() {
  var el = $('#chatinput input');
  var curPos = el.get(0).selectionStart;
  var text = el.val();
  var word = text.slice(0, curPos).replace(/.*\b([a-z0-9-_])/, '$1').toLowerCase();

  var list = $('#chat > div:visible mark');
  list = list.map(function(ind, mark) { return $(mark).text(); } );
  list = uniqueArray(list);

  var nick = null;
  for(var i = 0; i < list.length; i++) {
    if(!list[i].toLowerCase().startsWith(word)) continue;
    if(nick && nick !== list[i]) {
      console.log('More than one nick matches, aborting. ('+list[i]+' vs '+nick+')');
      return;
    }
    nick = list[i];
  }
  if(!nick) {
    console.log('No matches for ' + word);
    return;
  }

  var posStart = curPos - word.length;
  var newText = text.substring(0, posStart);
  newText += nick + (posStart === 0 ? ': ' : ' ');
  newText += text.substring(curPos);
  el.val(newText);
}

//
// timestamp and clear management
//

window.chat.getTimestamps = function(isFaction) {
  var storage = isFaction ? chat._factionData : chat._publicData;
  return $.map(storage, function(v, k) { return [v[0]]; });
}

window.chat.getOldestTimestamp = function(isFaction) {
  var t = Math.min.apply(null, chat.getTimestamps(isFaction));
  return t === Infinity ? -1 : t;
}

window.chat.getNewestTimestamp = function(isFaction) {
  var t = Math.max.apply(null, chat.getTimestamps(isFaction));
  return t === -1*Infinity ? -1 : t;
}

window.chat._oldBBox = null;
window.chat.genPostData = function(isFaction, getOlderMsgs) {
  if(typeof isFaction !== 'boolean') throw('Need to know if public or faction chat.');

  chat._localRangeCircle.setLatLng(map.getCenter());
  var b = map.getBounds().extend(chat._localRangeCircle.getBounds());
  var ne = b.getNorthEast();
  var sw = b.getSouthWest();

  // round bounds in order to ignore rounding errors
  var bbs = $.map([ne.lat, ne.lng, sw.lat, sw.lng], function(x) { return Math.round(x*1E4) }).join();
  if(chat._oldBBox && chat._oldBBox !== bbs) {
    $('#chat > div').data('needsClearing', true);
    console.log('Bounding Box changed, chat will be cleared (old: '+chat._oldBBox+' ; new: '+bbs+' )');
    // need to reset these flags now because clearing will only occur
    // after the request is finished – i.e. there would be one almost
    // useless request.
    chat._factionData = {};
    chat._publicData = {};
  }
  chat._oldBBox = bbs;

  var ne = b.getNorthEast();
  var sw = b.getSouthWest();
  var data = {
    desiredNumItems: isFaction ? CHAT_FACTION_ITEMS : CHAT_PUBLIC_ITEMS ,
    minLatE6: Math.round(sw.lat*1E6),
    minLngE6: Math.round(sw.lng*1E6),
    maxLatE6: Math.round(ne.lat*1E6),
    maxLngE6: Math.round(ne.lng*1E6),
    minTimestampMs: -1,
    maxTimestampMs: -1,
    factionOnly: isFaction
  }

  if(getOlderMsgs) {
    // ask for older chat when scrolling up
    data = $.extend(data, {maxTimestampMs: chat.getOldestTimestamp(isFaction)});
  } else {
    // ask for newer chat
    var min = chat.getNewestTimestamp(isFaction);
    // the inital request will have both timestamp values set to -1,
    // thus we receive the newest desiredNumItems. After that, we will
    // only receive messages with a timestamp greater or equal to min
    // above.
    // After resuming from idle, there might be more new messages than
    // desiredNumItems. So on the first request, we are not really up to
    // date. We will eventually catch up, as long as there are less new
    // messages than desiredNumItems per each refresh cycle.
    // A proper solution would be to query until no more new results are
    // returned. Another way would be to set desiredNumItems to a very
    // large number so we really get all new messages since the last
    // request. Setting desiredNumItems to -1 does unfortunately not
    // work.
    // Currently this edge case is not handled. Let’s see if this is a
    // problem in crowded areas.
    $.extend(data, {minTimestampMs: min});
  }
  return data;
}



//
// faction
//

window.chat._requestFactionRunning = false;
window.chat.requestFaction = function(getOlderMsgs, isRetry) {
  if(chat._requestFactionRunning && !isRetry) return;
  if(isIdle()) return renderUpdateStatus();
  chat._requestFactionRunning = true;

  var d = chat.genPostData(true, getOlderMsgs);
  var r = window.postAjax(
    'getPaginatedPlextsV2',
    d,
    chat.handleFaction,
    isRetry
      ? function() { window.chat._requestFactionRunning = false; }
      : function() { window.chat.requestFaction(getOlderMsgs, true) }
  );

  requests.add(r);
}


window.chat._factionData = {};
window.chat.handleFaction = function(data, textStatus, jqXHR) {
  chat._requestFactionRunning = false;

  if(!data || !data.result) {
    window.failedRequestCount++;
    return console.warn('faction chat error. Waiting for next auto-refresh.');
  }

  if(data.result.length === 0) return;

  var old = chat.getOldestTimestamp(true);
  chat.writeDataToHash(data, chat._factionData, false);
  var oldMsgsWereAdded = old !== chat.getOldestTimestamp(true);

  window.chat.renderFaction(oldMsgsWereAdded);

  if(data.result.length >= CHAT_FACTION_ITEMS) chat.needMoreMessages();
}

window.chat.renderFaction = function(oldMsgsWereAdded) {
  chat.renderData(chat._factionData, 'chatfaction', oldMsgsWereAdded);
}


//
// public
//

window.chat._requestPublicRunning = false;
window.chat.requestPublic = function(getOlderMsgs, isRetry) {
  if(chat._requestPublicRunning && !isRetry) return;
  if(isIdle()) return renderUpdateStatus();
  chat._requestPublicRunning = true;

  var d = chat.genPostData(false, getOlderMsgs);
  var r = window.postAjax(
    'getPaginatedPlextsV2',
    d,
    chat.handlePublic,
    isRetry
      ? function() { window.chat._requestPublicRunning = false; }
      : function() { window.chat.requestPublic(getOlderMsgs, true) }
  );

  requests.add(r);
}

window.chat._publicData = {};
window.chat.handlePublic = function(data, textStatus, jqXHR) {
  chat._requestPublicRunning = false;

  if(!data || !data.result) {
    window.failedRequestCount++;
    return console.warn('public chat error. Waiting for next auto-refresh.');
  }

  if(data.result.length === 0) return;

  var old = chat.getOldestTimestamp(false);
  chat.writeDataToHash(data, chat._publicData, true);
  var oldMsgsWereAdded = old !== chat.getOldestTimestamp(false);

  runHooks('publicChatDataAvailable', {raw: data, processed: chat._publicData});

  switch(chat.getActive()) {
    case 'public': window.chat.renderPublic(oldMsgsWereAdded); break;
    case 'compact': window.chat.renderCompact(oldMsgsWereAdded); break;
    case 'full': window.chat.renderFull(oldMsgsWereAdded); break;
  }

  if(data.result.length >= CHAT_PUBLIC_ITEMS) chat.needMoreMessages();
}

window.chat.renderPublic = function(oldMsgsWereAdded) {
  // only keep player data
  var data = $.map(chat._publicData, function(entry) {
    if(!entry[1]) return [entry];
  });
  chat.renderData(data, 'chatpublic', oldMsgsWereAdded);
}

window.chat.renderCompact = function(oldMsgsWereAdded) {
  var data = {};
  $.each(chat._publicData, function(guid, entry) {
    // skip player msgs
    if(!entry[1]) return true;
    var pguid = entry[3];
    // ignore if player has newer data
    if(data[pguid] && data[pguid][0] > entry[0]) return true;
    data[pguid] = entry;
  });
  // data keys are now player guids instead of message guids. However,
  // it is all the same to renderData.
  chat.renderData(data, 'chatcompact', oldMsgsWereAdded);
}

window.chat.renderFull = function(oldMsgsWereAdded) {
  // only keep automatically generated data
  var data = $.map(chat._publicData, function(entry) {
    if(entry[1]) return [entry];
  });
  chat.renderData(data, 'chatfull', oldMsgsWereAdded);
}


//
// common
//

window.chat.writeDataToHash = function(newData, storageHash, skipSecureMsgs) {
  $.each(newData.result, function(ind, json) {
    // avoid duplicates
    if(json[0] in storageHash) return true;

    var skipThisEntry = false;

    var time = json[1];
    var team = json[2].plext.team === 'ALIENS' ? TEAM_ENL : TEAM_RES;
    var auto = json[2].plext.plextType !== 'PLAYER_GENERATED';
    var msg = '', nick = '', pguid;
    $.each(json[2].plext.markup, function(ind, markup) {
      switch(markup[0]) {
      case 'SENDER': // user generated messages
        nick = markup[1].plain.slice(0, -2); // cut “: ” at end
        pguid = markup[1].guid;
        break;

      case 'PLAYER': // automatically generated messages
        pguid = markup[1].guid;
        nick = markup[1].plain;
        team = markup[1].team === 'ALIENS' ? TEAM_ENL : TEAM_RES;
        if(ind > 0) msg += nick; // don’t repeat nick directly
        break;

      case 'TEXT':
        var tmp = $('<div/>').text(markup[1].plain).html().autoLink();
        msg += tmp.replace(window.PLAYER['nickMatcher'], '<em>$1</em>');
        break;

      case 'PORTAL':
        var latlng = [markup[1].latE6/1E6, markup[1].lngE6/1E6];
        var js = 'window.zoomToAndShowPortal(\''+markup[1].guid+'\', ['+latlng[0]+', '+latlng[1]+'])';
        msg += '<a onclick="'+js+'" title="'+markup[1].address+'" class="help">'+markup[1].name+'</a>';
        break;

      case 'SECURE':
        if(skipSecureMsgs) {
          skipThisEntry = true;
          return false; // breaks $.each
        }
      }
    });
    if(skipThisEntry) return true;

    // format: timestamp, autogenerated, HTML message, player guid
    storageHash[json[0]] = [json[1], auto, chat.renderMsg(msg, nick, time, team), pguid];

    window.setPlayerName(pguid, nick); // free nick name resolves
  });
}

// renders data from the data-hash to the element defined by the given
// ID. Set 3rd argument to true if it is likely that old data has been
// added. Latter is only required for scrolling.
window.chat.renderData = function(data, element, likelyWereOldMsgs) {
  var elm = $('#'+element);
  if(elm.is(':hidden')) return;

  // discard guids and sort old to new
  var vals = $.map(data, function(v, k) { return [v]; });
  vals = vals.sort(function(a, b) { return a[0]-b[0]; });

  // render to string with date separators inserted
  var msgs = '';
  var prevTime = null;
  $.each(vals, function(ind, msg) {
    var nextTime = new Date(msg[0]).toLocaleDateString();
    if(prevTime && prevTime !== nextTime)
      msgs += chat.renderDivider(nextTime);
    msgs += msg[2];
    prevTime = nextTime;
  });

  var scrollBefore = scrollBottom(elm);
  elm.html('<table>' + msgs + '</table>');
  chat.keepScrollPosition(elm, scrollBefore, likelyWereOldMsgs);
}


window.chat.renderDivider = function(text) {
  var d = ' ──────────────────────────────────────────────────────────────────────────';
  return '<tr><td colspan="3" style="padding-top:3px"><summary>─ ' + text + d + '</summary></td></tr>';
}


window.chat.renderMsg = function(msg, nick, time, team) {
  var ta = unixTimeToHHmm(time);
  var tb = unixTimeToString(time, true);
  // help cursor via “#chat time”
  var t = '<time title="'+tb+'" data-timestamp="'+time+'">'+ta+'</time>';
  var s = 'style="color:'+COLORS[team]+'"';
  var title = nick.length >= 8 ? 'title="'+nick+'" class="help"' : '';
  var i = ['<span class="invisep">&lt;</span>', '<span class="invisep">&gt;</span>'];
  return '<tr><td>'+t+'</td><td>'+i[0]+'<mark '+s+'>'+nick+'</mark>'+i[1]+'</td><td>'+msg+'</td></tr>';
}



window.chat.getActive = function() {
  return $('#chatcontrols .active').text();
}


window.chat.toggle = function() {
  var c = $('#chat, #chatcontrols');
  if(c.hasClass('expand')) {
    $('#chatcontrols a:first').html('<span class="toggle expand"></span>');
    c.removeClass('expand');
    var div = $('#chat > div:visible');
    div.data('ignoreNextScroll', true);
    div.scrollTop(99999999); // scroll to bottom
    $('.leaflet-control').css('margin-left', '13px');
  } else {
    $('#chatcontrols a:first').html('<span class="toggle shrink"></span>');
    c.addClass('expand');
    $('.leaflet-control').css('margin-left', '720px');
    chat.needMoreMessages();
  }
}


window.chat.request = function() {
  console.log('refreshing chat');
  chat.requestFaction(false);
  chat.requestPublic(false);
}


// checks if there are enough messages in the selected chat tab and
// loads more if not.
window.chat.needMoreMessages = function() {
  var activeTab = chat.getActive();
  if(activeTab === 'debug') return;

  var activeChat = $('#chat > :visible');

  var hasScrollbar = scrollBottom(activeChat) !== 0 || activeChat.scrollTop() !== 0;
  var nearTop = activeChat.scrollTop() <= CHAT_REQUEST_SCROLL_TOP;
  if(hasScrollbar && !nearTop) return;

  console.log('No scrollbar or near top in active chat. Requesting more data.');

  if(activeTab === 'faction')
    chat.requestFaction(true);
  else
    chat.requestPublic(true);
}


window.chat.chooser = function(event) {
  var t = $(event.target);
  var tt = t.text();

  var mark = $('#chatinput mark');

  $('#chatcontrols .active').removeClass('active');
  t.addClass('active');

  $('#chat > div').hide();

  var elm;

  switch(tt) {
    case 'faction':
      mark.css('color', '');
      mark.text('tell faction:');
      break;

    case 'public':
      mark.css('cssText', 'color: red !important');
      mark.text('broadcast:');
      break;

    case 'compact':
    case 'full':
      mark.css('cssText', 'color: #bbb !important');
      mark.text('tell Jarvis:');
      break;

    default:
      throw('chat.chooser was asked to handle unknown button: ' + tt);
  }

  var elm = $('#chat' + tt);
  elm.show();
  eval('chat.render' + tt.capitalize() + '(false);');
  if(elm.data('needsScrollTop')) {
    elm.data('ignoreNextScroll', true);
    elm.scrollTop(elm.data('needsScrollTop'));
    elm.data('needsScrollTop', null);
  }

  chat.needMoreMessages();
}


// contains the logic to keep the correct scroll position.
window.chat.keepScrollPosition = function(box, scrollBefore, isOldMsgs) {
  // If scrolled down completely, keep it that way so new messages can
  // be seen easily. If scrolled up, only need to fix scroll position
  // when old messages are added. New messages added at the bottom don’t
  // change the view and enabling this would make the chat scroll down
  // for every added message, even if the user wants to read old stuff.

  if(box.is(':hidden') && !isOldMsgs) {
    box.data('needsScrollTop', 99999999);
    return;
  }

  if(scrollBefore === 0 || isOldMsgs) {
    box.data('ignoreNextScroll', true);
    box.scrollTop(box.scrollTop() + (scrollBottom(box)-scrollBefore));
  }
}




//
// setup
//

window.chat.setup = function() {
  window.chat._localRangeCircle =  L.circle(map.getCenter(), CHAT_MIN_RANGE*1000);

  $('#chatcontrols, #chat, #chatinput').show();

  $('#chatcontrols a:first').click(window.chat.toggle);
  $('#chatcontrols a').each(function(ind, elm) {
    if($.inArray($(elm).text(), ['full', 'compact', 'public', 'faction']) !== -1)
      $(elm).click(window.chat.chooser);
  });


  $('#chatinput').click(function() {
    $('#chatinput input').focus();
  });

  window.chat.setupTime();
  window.chat.setupPosting();

  $('#chatfaction').scroll(function() {
    var t = $(this);
    if(t.data('ignoreNextScroll')) return t.data('ignoreNextScroll', false);
    if(t.scrollTop() < CHAT_REQUEST_SCROLL_TOP) chat.requestFaction(true);
    if(scrollBottom(t) === 0) chat.requestFaction(false);
  });

  $('#chatpublic, #chatfull, #chatcompact').scroll(function() {
    var t = $(this);
    if(t.data('ignoreNextScroll')) return t.data('ignoreNextScroll', false);
    if(t.scrollTop() < CHAT_REQUEST_SCROLL_TOP) chat.requestPublic(true);
    if(scrollBottom(t) === 0) chat.requestPublic(false);
  });

  chat.request();
  window.addResumeFunction(chat.request);
  window.requests.addRefreshFunction(chat.request);

  var cls = PLAYER.team === 'ALIENS' ? 'enl' : 'res';
  $('#chatinput mark').addClass(cls)
}


window.chat.setupTime = function() {
  var inputTime = $('#chatinput time');
  var updateTime = function() {
    if(window.isIdle()) return;
    var d = new Date();
    var h = d.getHours() + ''; if(h.length === 1) h = '0' + h;
    var m = d.getMinutes() + ''; if(m.length === 1) m = '0' + m;
    inputTime.text(h+':'+m);
    // update ON the minute (1ms after)
    setTimeout(updateTime, (60 - d.getSeconds()) * 1000 + 1);
  };
  updateTime();
  window.addResumeFunction(updateTime);
}


//
// posting
//


window.chat.setupPosting = function() {
  $('#chatinput input').keydown(function(event) {
    try {
      var kc = (event.keyCode ? event.keyCode : event.which);
      if(kc === 13) { // enter
        chat.postMsg();
        event.preventDefault();
      } else if (kc === 9) { // tab
        event.preventDefault();
        window.chat.handleTabCompletion();
      }
    } catch(error) {
      console.log(error);
      debug.printStackTrace();
    }
  });

  $('#chatinput').submit(function(event) {
    event.preventDefault();
    chat.postMsg();
  });
}


window.chat.postMsg = function() {
  var c = chat.getActive();
  if(c === 'full' || c === 'compact')
    return alert('Jarvis: A strange game. The only winning move is not to play. How about a nice game of chess?');

  var msg = $.trim($('#chatinput input').val());
  if(!msg || msg === '') return;

  if(c === 'debug') return new Function (msg)();

  var public = c === 'public';
  var latlng = map.getCenter();

  var data = {message: msg,
              latE6: Math.round(latlng.lat*1E6),
              lngE6: Math.round(latlng.lng*1E6),
              factionOnly: !public};

  var errMsg = 'Your message could not be delivered. You can copy&' +
               'paste it here and try again if you want:\n\n' + msg;

  window.postAjax('sendPlext', data,
    function(response) {
      if(response.error) alert(errMsg);
      if(public) chat.requestPublic(false); else chat.requestFaction(false); },
    function() {
      alert(errMsg);
    }
  );

  $('#chatinput input').val('');
}



// DEBUGGING TOOLS ///////////////////////////////////////////////////
// meant to be used from browser debugger tools and the like.

window.debug = function() {}

window.debug.renderDetails = function() {
  console.log('portals: ' + Object.keys(portals).length);
  console.log('links:   ' + Object.keys(links).length);
  console.log('fields:  ' + Object.keys(fields).length);
}

window.debug.printStackTrace = function() {
  var e = new Error('dummy');
  console.log(e.stack);
  return e.stack;
}

window.debug.clearPortals = function() {
  for(var i = 0; i < portalsLayers.length; i++)
    portalsLayers[i].clearLayers();
}

window.debug.clearLinks = function() {
  linksLayer.clearLayers();
}

window.debug.clearFields = function() {
  fieldsLayer.clearLayers();
}

window.debug.getFields = function() {
  return fields;
}

window.debug.forceSync = function() {
  localStorage.clear();
  window.playersToResolve = [];
  window.playersInResolving = [];
  debug.clearFields();
  debug.clearLinks();
  debug.clearPortals();
  updateGameScore();
  requestData();
}

window.debug.console = function() {
  $('#debugconsole').text();
}

window.debug.console.create = function() {
  if($('#debugconsole').length) return;
  $('#chatcontrols').append('<a>debug</a>');
  $('#chatcontrols a:last').click(function() {
    $('#chatinput mark').css('cssText', 'color: #bbb !important').text('debug:');
    $('#chat > div').hide();
    $('#debugconsole').show();
    $('#chatcontrols .active').removeClass('active');
    $(this).addClass('active');
  });
  $('#chat').append('<div style="display: none" id="debugconsole"><table></table></div>');
}

window.debug.console.renderLine = function(text, errorType) {
  debug.console.create();
  switch(errorType) {
    case 'error':   var color = '#FF424D'; break;
    case 'warning': var color = '#FFDE42'; break;
    case 'alert':   var color = '#42FF90'; break;
    default:        var color = '#eee';
  }
  if(typeof text !== 'string' && typeof text !== 'number') text = JSON.stringify(text);
  var d = new Date();
  var ta = d.toLocaleTimeString(); // print line instead maybe?
  var tb = d.toLocaleString();
  var t = '<time title="'+tb+'" data-timestamp="'+d.getTime()+'">'+ta+'</time>';
  var s = 'style="color:'+color+'"';
  var l = '<tr><td>'+t+'</td><td><mark '+s+'>'+errorType+'</mark></td><td>'+text+'</td></tr>';
  $('#debugconsole table').prepend(l);
}

window.debug.console.log = function(text) {
  debug.console.renderLine(text, 'notice');
}

window.debug.console.warn = function(text) {
  debug.console.renderLine(text, 'warning');
}

window.debug.console.error = function(text) {
  debug.console.renderLine(text, 'error');
}

window.debug.console.alert = function(text) {
  debug.console.renderLine(text, 'alert');
}

window.debug.console.overwriteNative = function() {
  window.debug.console.create();
  window.console = function() {}
  window.console.log = window.debug.console.log;
  window.console.warn = window.debug.console.warn;
  window.console.error = window.debug.console.error;
  window.alert = window.debug.console.alert;
}

window.debug.console.overwriteNativeIfRequired = function() {
  if(!window.console || L.Browser.mobile)
    window.debug.console.overwriteNative();
}




// ENTITY DETAILS TOOLS //////////////////////////////////////////////
// hand any of these functions the details-hash of an entity (i.e.
// portal, link, field) and they will return useful data.


// given the entity detail data, returns the team the entity belongs
// to. Uses TEAM_* enum values.
window.getTeam = function(details) {
  var team = TEAM_NONE;
  if(details.controllingTeam.team === 'ALIENS') team = TEAM_ENL;
  if(details.controllingTeam.team === 'RESISTANCE') team = TEAM_RES;
  return team;
}



// GAME STATUS ///////////////////////////////////////////////////////
// MindUnit display
window.updateGameScore = function(data) {
  if(!data) {
    window.postAjax('getGameScore', {}, window.updateGameScore);
    return;
  }

  var r = parseInt(data.result.resistanceScore), e = parseInt(data.result.alienScore);
  var s = r+e;
  var rp = r/s*100, ep = e/s*100;
  r = digits(r), e = digits(e);
  var rs = '<span class="res" style="width:'+rp+'%;">'+Math.round(rp)+'%&nbsp;</span>';
  var es = '<span class="enl" style="width:'+ep+'%;">&nbsp;'+Math.round(ep)+'%</span>';
  $('#gamestat').html(rs+es).one('click', function() { window.updateGameScore() });
  // help cursor via “#gamestat span”
  $('#gamestat').attr('title', 'Resistance:\t'+r+' MindUnits\nEnlightenment:\t'+e+' MindUnits');

  window.setTimeout('window.updateGameScore', REFRESH_GAME_SCORE*1000);
}



// GEOSEARCH /////////////////////////////////////////////////////////

window.setupGeosearch = function() {
  $('#geosearch').keypress(function(e) {
    if((e.keyCode ? e.keyCode : e.which) != 13) return;
    $.getJSON(NOMINATIM + encodeURIComponent($(this).val()), function(data) {
      if(!data || !data[0]) return;
      var b = data[0].boundingbox;
      if(!b) return;
      var southWest = new L.LatLng(b[0], b[2]),
          northEast = new L.LatLng(b[1], b[3]),
          bounds = new L.LatLngBounds(southWest, northEast);
      window.map.fitBounds(bounds);
    });
    e.preventDefault();
  });
}


// PLUGIN HOOKS ////////////////////////////////////////////////////////
// Plugins may listen to any number of events by specifying the name of
// the event to listen to and handing a function that should be exe-
// cuted when an event occurs. Callbacks will receive additional data
// the event created as their first parameter. The value is always a
// hash that contains more details.
//
// For example, this line will listen for portals to be added and print
// the data generated by the event to the console:
// window.addHook('portalAdded', function(data) { console.log(data) });
//
// Boot hook: booting is handled differently because IITC may not yet
//            be available. Have a look at the plugins in plugins/. All
//            code before “// PLUGIN START” and after “// PLUGIN END” os
//            required to successfully boot the plugin.
//
// Here’s more specific information about each event:
// portalAdded: called when a portal has been received and is about to
//              be added to its layer group. Note that this does NOT
//              mean it is already visible or will be, shortly after.
//              If a portal is added to a hidden layer it may never be
//              shown at all. Injection point is in
//              code/map_data.js#renderPortal near the end. Will hand
//              the Leaflet CircleMarker for the portal in "portal" var.
// portalDetailsUpdated: fired after the details in the sidebar have
//              been (re-)rendered Provides data about the portal that
//              has been selected.
// publicChatDataAvailable: this hook runs after data for any of the
//              public chats has been received and processed, but not
//              yet been displayed. The data hash contains both the un-
//              processed raw ajax response as well as the processed
//              chat data that is going to be used for display.


window._hooks = {}
window.VALID_HOOKS = ['portalAdded', 'portalDetailsUpdated',
  'publicChatDataAvailable'];

window.runHooks = function(event, data) {
  if(VALID_HOOKS.indexOf(event) === -1) throw('Unknown event type: ' + event);

  if(!_hooks[event]) return;
  $.each(_hooks[event], function(ind, callback) {
    callback(data);
  });
}


window.addHook = function(event, callback) {
  if(VALID_HOOKS.indexOf(event) === -1) throw('Unknown event type: ' + event);
  if(typeof callback !== 'function') throw('Callback must be a function.');

  if(!_hooks[event])
    _hooks[event] = [callback];
  else
    _hooks[event].push(callback);
}


// IDLE HANDLING /////////////////////////////////////////////////////

window.idleTime = 0; // in minutes

setInterval('window.idleTime += 1', 60*1000);
var idleReset = function () {
  // update immediately when the user comes back
  if(isIdle()) {
    window.idleTime = 0;
    $.each(window._onResumeFunctions, function(ind, f) {
      f();
    });
  }
  window.idleTime = 0;
};
$('body').mousemove(idleReset).keypress(idleReset);

window.isIdle = function() {
  return window.idleTime >= MAX_IDLE_TIME;
}

window._onResumeFunctions = [];

// add your function here if you want to be notified when the user
// resumes from being idle
window.addResumeFunction = function(f) {
  window._onResumeFunctions.push(f);
}



// LOCATION HANDLING /////////////////////////////////////////////////
// i.e. setting initial position and storing new position after moving

// retrieves current position from map and stores it cookies
window.storeMapPosition = function() {
  var m = window.map.getCenter();

  if(m['lat'] >= -90  && m['lat'] <= 90)
    writeCookie('ingress.intelmap.lat', m['lat']);

  if(m['lng'] >= -180 && m['lng'] <= 180)
    writeCookie('ingress.intelmap.lng', m['lng']);

  writeCookie('ingress.intelmap.zoom', window.map.getZoom());
}


// either retrieves the last shown position from a cookie, from the
// URL or if neither is present, via Geolocation. If that fails, it
// returns a map that shows the whole world.
window.getPosition = function() {
  if(getURLParam('latE6') && getURLParam('lngE6')) {
    console.log("mappos: reading URL params");
    var lat = parseInt(getURLParam('latE6'))/1E6 || 0.0;
    var lng = parseInt(getURLParam('lngE6'))/1E6 || 0.0;
    // google seems to zoom in far more than leaflet
    var z = parseInt(getURLParam('z'))+1 || 17;
    return {center: new L.LatLng(lat, lng), zoom: z > 18 ? 18 : z};
  }

  if(readCookie('ingress.intelmap.lat') && readCookie('ingress.intelmap.lng')) {
    console.log("mappos: reading cookies");
    var lat = parseFloat(readCookie('ingress.intelmap.lat')) || 0.0;
    var lng = parseFloat(readCookie('ingress.intelmap.lng')) || 0.0;
    var z = parseInt(readCookie('ingress.intelmap.zoom')) || 17;

    if(lat < -90  || lat > 90) lat = 0.0;
    if(lng < -180 || lng > 180) lng = 0.0;

    return {center: new L.LatLng(lat, lng), zoom: z > 18 ? 18 : z};
  }

  setTimeout("window.map.locate({setView : true, maxZoom: 13});", 50);

  return {center: new L.LatLng(0.0, 0.0), zoom: 1};
}



// MAP DATA //////////////////////////////////////////////////////////
// these functions handle how and which entities are displayed on the
// map. They also keep them up to date, unless interrupted by user
// action.


// requests map data for current viewport. For details on how this
// works, refer to the description in “MAP DATA REQUEST CALCULATORS”
window.requestData = function() {
  console.log('refreshing data');
  requests.abort();
  cleanUp();

  var magic = convertCenterLat(map.getCenter().lat);
  var R = calculateR(magic);

  var bounds = map.getBounds();
  // convert to point values
  topRight = convertLatLngToPoint(bounds.getNorthEast(), magic, R);
  bottomLeft = convertLatLngToPoint(bounds.getSouthWest() , magic, R);
  // how many quadrants intersect the current view?
  quadsX = Math.abs(bottomLeft.x - topRight.x);
  quadsY = Math.abs(bottomLeft.y - topRight.y);

  // will group requests by second-last quad-key quadrant
  tiles = {};

  // walk in x-direction, starts right goes left
  for(var i = 0; i <= quadsX; i++) {
    var x = Math.abs(topRight.x - i);
    var qk = pointToQuadKey(x, topRight.y);
    var bnds = convertPointToLatLng(x, topRight.y, magic, R);
    if(!tiles[qk.slice(0, -1)]) tiles[qk.slice(0, -1)] = [];
    tiles[qk.slice(0, -1)].push(generateBoundsParams(qk, bnds));

    // walk in y-direction, starts top, goes down
    for(var j = 1; j <= quadsY; j++) {
      var qk = pointToQuadKey(x, topRight.y + j);
      var bnds = convertPointToLatLng(x, topRight.y + j, magic, R);
      if(!tiles[qk.slice(0, -1)]) tiles[qk.slice(0, -1)] = [];
      tiles[qk.slice(0, -1)].push(generateBoundsParams(qk, bnds));
    }
  }

  // finally send ajax requests
  $.each(tiles, function(ind, tls) {
    data = { minLevelOfDetail: -1 };
    data.boundsParamsList = tls;
    window.requests.add(window.postAjax('getThinnedEntitiesV2', data, window.handleDataResponse));
  });
}

// works on map data response and ensures entities are drawn/updated.
window.handleDataResponse = function(data, textStatus, jqXHR) {
  // remove from active ajax queries list
  if(!data || !data.result) {
    window.failedRequestCount++;
    console.warn(data);
    return;
  }

  var portalUpdateAvailable = false;
  var portalInUrlAvailable = false;
  var m = data.result.map;
  // defer rendering of portals because there is no z-index in SVG.
  // this means that what’s rendered last ends up on top. While the
  // portals can be brought to front, this costs extra time. They need
  // to be in the foreground, or they cannot be clicked. See
  // https://github.com/Leaflet/Leaflet/issues/185
  var ppp = [];
  var p2f = {};
  $.each(m, function(qk, val) {
    $.each(val.deletedGameEntityGuids, function(ind, guid) {
      if(getTypeByGuid(guid) === TYPE_FIELD && window.fields[guid] !== undefined) {
        $.each(window.fields[guid].options.vertices, function(ind, vertex) {
          if(window.portals[vertex.guid] === undefined) return true;
          fieldArray = window.portals[vertex.guid].options.details.portalV2.linkedFields;
          fieldArray.splice($.inArray(guid, fieldArray), 1);
        });
      }
      window.removeByGuid(guid);
    });

    $.each(val.gameEntities, function(ind, ent) {
      // ent = [GUID, id(?), details]
      // format for links: { controllingTeam, creator, edge }
      // format for portals: { controllingTeam, turret }

      if(ent[2].turret !== undefined) {
        if(selectedPortal === ent[0]) portalUpdateAvailable = true;
        if(urlPortal && ent[0] == urlPortal) portalInUrlAvailable = true;

        var latlng = [ent[2].locationE6.latE6/1E6, ent[2].locationE6.lngE6/1E6];
        if(!window.getPaddedBounds().contains(latlng)
              && selectedPortal !== ent[0]
              && urlPortal !== ent[0]
          ) return;



        ppp.push(ent); // delay portal render
      } else if(ent[2].edge !== undefined) {
        renderLink(ent);
      } else if(ent[2].capturedRegion !== undefined) {
        $.each(ent[2].capturedRegion, function(ind, vertex) {
          if(p2f[vertex.guid] === undefined)
            p2f[vertex.guid] = new Array();
          p2f[vertex.guid].push(ent[0]);
        });
        renderField(ent);
      } else {
        throw('Unknown entity: ' + JSON.stringify(ent));
      }
    });
  });

  $.each(ppp, function(ind, portal) {
    if(portal[2].portalV2['linkedFields'] === undefined) {
      portal[2].portalV2['linkedFields'] = [];
    }
    if(p2f[portal[0]] !== undefined) {
      $.merge(p2f[portal[0]], portal[2].portalV2['linkedFields']);
      portal[2].portalV2['linkedFields'] = uniqueArray(p2f[portal[0]]);
    }
  });

  // Preserve and restore "selectedPortal" between portal re-render
  if(portalUpdateAvailable) var oldSelectedPortal = selectedPortal;
  $.each(ppp, function(ind, portal) { renderPortal(portal); });

  var selectedPortalLayer = portals[oldSelectedPortal];
  if(portalUpdateAvailable && selectedPortalLayer) selectedPortal = oldSelectedPortal;

  if(selectedPortalLayer) {
    try {
      selectedPortalLayer.bringToFront();
    } catch(e) { /* portal is now visible, catch Leaflet error */ }
  }

  if(portalInUrlAvailable) {
    renderPortalDetails(urlPortal);
    urlPortal = null; // select it only once
  }

  if(portalUpdateAvailable) renderPortalDetails(selectedPortal);
  resolvePlayerNames();
}

// removes entities that are still handled by Leaflet, although they
// do not intersect the current viewport.
window.cleanUp = function() {
  var cnt = [0,0,0];
  var b = getPaddedBounds();
  var minlvl = getMinPortalLevel();
  for(var i = 0; i < portalsLayers.length; i++) {
    // i is also the portal level
    portalsLayers[i].eachLayer(function(item) {
      var itemGuid = item.options.guid;
      // check if 'item' is a portal
      if(getTypeByGuid(itemGuid) != TYPE_PORTAL) return true;
      // portal must be in bounds and have a high enough level. Also don’t
      // remove if it is selected.
      if(itemGuid == window.selectedPortal ||
        (b.contains(item.getLatLng()) && i >= minlvl)) return true;
      cnt[0]++;
      portalsLayers[i].removeLayer(item);
    });
  }
  linksLayer.eachLayer(function(link) {
    if(b.intersects(link.getBounds())) return;
    cnt[1]++;
    linksLayer.removeLayer(link);
  });
  fieldsLayer.eachLayer(function(field) {
    if(b.intersects(field.getBounds())) return;
    cnt[2]++;
    fieldsLayer.removeLayer(field);
  });
  console.log('removed out-of-bounds: '+cnt[0]+' portals, '+cnt[1]+' links, '+cnt[2]+' fields');
}


// removes given entity from map
window.removeByGuid = function(guid) {
  switch(getTypeByGuid(guid)) {
    case TYPE_PORTAL:
      if(!window.portals[guid]) return;
      var p = window.portals[guid];
      for(var i = 0; i < portalsLayers.length; i++)
        portalsLayers[i].removeLayer(p);
      break;
    case TYPE_LINK:
      if(!window.links[guid]) return;
      linksLayer.removeLayer(window.links[guid]);
      break;
    case TYPE_FIELD:
      if(!window.fields[guid]) return;
      fieldsLayer.removeLayer(window.fields[guid]);
      break;
    case TYPE_RESONATOR:
      if(!window.resonators[guid]) return;
      var r = window.resonators[guid];
      for(var i = 1; i < portalsLayers.length; i++)
        portalsLayers[i].removeLayer(r);
      break;
    default:
      console.warn('unknown GUID type: ' + guid);
      //window.debug.printStackTrace();
  }
}



// renders a portal on the map from the given entity
window.renderPortal = function(ent) {
  if(Object.keys(portals).length >= MAX_DRAWN_PORTALS && ent[0] !== selectedPortal)
    return removeByGuid(ent[0]);

  // hide low level portals on low zooms
  var portalLevel = getPortalLevel(ent[2]);
  if(portalLevel < getMinPortalLevel()  && ent[0] !== selectedPortal)
    return removeByGuid(ent[0]);

  var team = getTeam(ent[2]);

  // do nothing if portal did not change
  var layerGroup = portalsLayers[parseInt(portalLevel)];
  var old = findEntityInLeaflet(layerGroup, window.portals, ent[0]);
  if(old) {
    var oo = old.options;
    var u = oo.team !== team;
    u = u || oo.level !== portalLevel;
    // nothing changed that requires re-rendering the portal.
    if(!u) {
      // let resos handle themselves if they need to be redrawn
      renderResonators(ent, old);
      // update stored details for portal details in sidebar.
      old.options.details = ent[2];
      return;
    }
  }

  // there were changes, remove old portal. Don’t put this in old, in
  // case the portal changed level and findEntityInLeaflet doesn’t find
  // it.
  removeByGuid(ent[0]);

  var latlng = [ent[2].locationE6.latE6/1E6, ent[2].locationE6.lngE6/1E6];

  // pre-loads player names for high zoom levels
  loadPlayerNamesForPortal(ent[2]);

  var lvWeight = Math.max(2, portalLevel / 1.5);
  var lvRadius = Math.max(portalLevel + 3, 5);

  var p = L.circleMarker(latlng, {
    radius: lvRadius + (L.Browser.mobile ? PORTAL_RADIUS_ENLARGE_MOBILE : 0),
    color: ent[0] === selectedPortal ? COLOR_SELECTED_PORTAL : COLORS[team],
    opacity: 1,
    weight: lvWeight,
    fillColor: COLORS[team],
    fillOpacity: 0.5,
    clickable: true,
    level: portalLevel,
    team: team,
    details: ent[2],
    guid: ent[0]});

  p.on('remove', function() {
    var portalGuid = this.options.guid

    // remove attached resonators, skip if
    // all resonators have already removed by zooming
    if(isResonatorsShow()) {
      for(var i = 0; i <= 7; i++)
        removeByGuid(portalResonatorGuid(portalGuid, i));
    }
    delete window.portals[portalGuid];
    if(window.selectedPortal === portalGuid) {
      window.unselectOldPortal();
      window.map.removeLayer(window.portalAccessIndicator);
      window.portalAccessIndicator = null;
    }
  });

  p.on('add', function() {
    // enable for debugging
    if(window.portals[this.options.guid]) throw('duplicate portal detected');
    window.portals[this.options.guid] = this;
    // handles the case where a selected portal gets removed from the
    // map by hiding all portals with said level
    if(window.selectedPortal !== this.options.guid)
      window.portalResetColor(this);
  });

  p.on('click',    function() { window.renderPortalDetails(ent[0]); });
  p.on('dblclick', function() {
    window.renderPortalDetails(ent[0]);
    window.map.setView(latlng, 17);
  });

  window.renderResonators(ent, null);

  window.runHooks('portalAdded', {portal: p});
  p.addTo(layerGroup);
}

window.renderResonators = function(ent, portalLayer) {
  if(!isResonatorsShow()) return;

  var portalLevel = getPortalLevel(ent[2]);
  if(portalLevel < getMinPortalLevel()  && ent[0] !== selectedPortal) return;
  var portalLatLng = [ent[2].locationE6.latE6/1E6, ent[2].locationE6.lngE6/1E6];

  var layerGroup = portalsLayers[parseInt(portalLevel)];
  var reRendered = false;
  $.each(ent[2].resonatorArray.resonators, function(i, rdata) {
    // skip if resonator didn't change
    if(portalLayer) {
      var oldRes = findEntityInLeaflet(layerGroup, window.resonators, portalResonatorGuid(ent[0], i));
      if(oldRes && isSameResonator(oldRes.options.details, rdata)) return true;
      if(oldRes) {
        if(isSameResonator(oldRes.options.details, rdata)) return true;
        removeByGuid(oldRes.options.guid);
      }
    }

    // skip and remove old resonator if no new resonator
    if(rdata === null) {
      return true;
    }

    // offset in meters
    var dn = rdata.distanceToPortal*SLOT_TO_LAT[rdata.slot];
    var de = rdata.distanceToPortal*SLOT_TO_LNG[rdata.slot];

    // Coordinate offset in radians
    var dLat = dn/EARTH_RADIUS;
    var dLon = de/(EARTH_RADIUS*Math.cos(Math.PI/180*(ent[2].locationE6.latE6/1E6)));

    // OffsetPosition, decimal degrees
    var lat0 = ent[2].locationE6.latE6/1E6 + dLat * 180/Math.PI;
    var lon0 = ent[2].locationE6.lngE6/1E6 + dLon * 180/Math.PI;
    var Rlatlng = [lat0, lon0];

    var resoGuid = portalResonatorGuid(ent[0], i);

    // the resonator
    var resoStyle =
      ent[0] === selectedPortal ? OPTIONS_RESONATOR_SELECTED : OPTIONS_RESONATOR_NON_SELECTED;
    var resoProperty = $.extend({
        opacity: 1,
        fillColor: COLORS_LVL[rdata.level],
        fillOpacity: rdata.energyTotal/RESO_NRG[rdata.level],
        clickable: false,
        guid: resoGuid
      }, resoStyle);

    var reso =  L.circleMarker(Rlatlng, resoProperty);

    // line connecting reso to portal
    var connStyle =
      ent[0] === selectedPortal ? OPTIONS_RESONATOR_LINE_SELECTED : OPTIONS_RESONATOR_LINE_NON_SELECTED;
    var connProperty =  $.extend({
        color: '#FFA000',
        dashArray: '0,10,8,4,8,4,8,4,8,4,8,4,8,4,8,4,8,4,8,4',
        fill: false,
        clickable: false
      }, connStyle);

    var conn = L.polyline([portalLatLng, Rlatlng], connProperty);


    // put both in one group, so they can be handled by the same logic.
    var r = L.layerGroup([reso, conn]);
    r.options = {
      level: rdata.level,
      details: rdata,
      pDetails: ent[2],
      guid: resoGuid
    };

    // However, LayerGroups (and FeatureGroups) don’t fire add/remove
    // events, thus this listener will be attached to the resonator. It
    // doesn’t matter to which element these are bound since Leaflet
    // will add/remove all elements of the LayerGroup at once.
    reso.on('remove', function() { delete window.resonators[this.options.guid]; });
    reso.on('add',    function() {
      if(window.resonators[this.options.guid]) {
        console.error('dup reso: ' + this.options.guid);
        window.debug.printStackTrace();
      }
      window.resonators[this.options.guid] = r;
    });

    r.addTo(portalsLayers[parseInt(portalLevel)]);
    reRendered = true;
  });
  // if there is any resonator re-rendered, bring portal to front
  if(reRendered && portalLayer) portalLayer.bringToFront();
}

// append portal guid with -resonator-[slot] to get guid for resonators
window.portalResonatorGuid = function(portalGuid, slot) {
  return portalGuid + '-resonator-' + slot;
}

window.isResonatorsShow = function() {
  return map.getZoom() >= RESONATOR_DISPLAY_ZOOM_LEVEL;
}

window.isSameResonator = function(oldRes, newRes) {
  if(!oldRes && !newRes) return true;
  if(typeof oldRes !== typeof newRes) return false;
  if(oldRes.level !== newRes.level) return false;
  if(oldRes.energyTotal !== newRes.energyTotal) return false;
  if(oldRes.distanceToPortal !== newRes.distanceToPortal) return false;
  return true;
}

window.portalResetColor = function(portal) {
  portal.setStyle({color:  COLORS[getTeam(portal.options.details)]});
  resonatorsResetStyle(portal.options.guid);
}

window.resonatorsResetStyle = function(portalGuid) {
  window.resonatorsSetStyle(portalGuid, OPTIONS_RESONATOR_NON_SELECTED, OPTIONS_RESONATOR_LINE_NON_SELECTED);
}

window.resonatorsSetSelectStyle = function(portalGuid) {
  window.resonatorsSetStyle(portalGuid, OPTIONS_RESONATOR_SELECTED, OPTIONS_RESONATOR_LINE_SELECTED);
}

window.resonatorsSetStyle = function(portalGuid, resoStyle, lineStyle) {
  for(var i = 0; i < 8; i++) {
    resonatorLayerGroup = resonators[portalResonatorGuid(portalGuid, i)];
    if(!resonatorLayerGroup) continue;
    // bring resonators and their connection lines to front separately.
    // this way the resonators are drawn on top of the lines.
    resonatorLayerGroup.eachLayer(function(layer) {
      if (!layer.options.guid)  // Resonator line
        layer.bringToFront().setStyle(lineStyle);
    });
    resonatorLayerGroup.eachLayer(function(layer) {
      if (layer.options.guid) // Resonator
        layer.bringToFront().setStyle(resoStyle);
    });
  }
  portals[portalGuid].bringToFront();
}

// renders a link on the map from the given entity
window.renderLink = function(ent) {
  if(Object.keys(links).length >= MAX_DRAWN_LINKS)
    return removeByGuid(ent[0]);

  // assume that links never change. If they do, they will have a
  // different ID.
  if(findEntityInLeaflet(linksLayer, links, ent[0])) return;

  var team = getTeam(ent[2]);
  var edge = ent[2].edge;
  var latlngs = [
    [edge.originPortalLocation.latE6/1E6, edge.originPortalLocation.lngE6/1E6],
    [edge.destinationPortalLocation.latE6/1E6, edge.destinationPortalLocation.lngE6/1E6]
  ];
  var poly = L.polyline(latlngs, {
    color: COLORS[team],
    opacity: 1,
    weight:2,
    clickable: false,
    guid: ent[0],
    smoothFactor: 10
  });

  if(!getPaddedBounds().intersects(poly.getBounds())) return;

  poly.on('remove', function() { delete window.links[this.options.guid]; });
  poly.on('add',    function() {
    // enable for debugging
    if(window.links[this.options.guid]) throw('duplicate link detected');
    window.links[this.options.guid] = this;
    this.bringToBack();
  });
  poly.addTo(linksLayer);
}

// renders a field on the map from a given entity
window.renderField = function(ent) {
  if(Object.keys(fields).length >= MAX_DRAWN_FIELDS)
    return window.removeByGuid(ent[0]);

  // assume that fields never change. If they do, they will have a
  // different ID.
  if(findEntityInLeaflet(fieldsLayer, fields, ent[0])) return;

  var team = getTeam(ent[2]);
  var reg = ent[2].capturedRegion;
  var latlngs = [
    [reg.vertexA.location.latE6/1E6, reg.vertexA.location.lngE6/1E6],
    [reg.vertexB.location.latE6/1E6, reg.vertexB.location.lngE6/1E6],
    [reg.vertexC.location.latE6/1E6, reg.vertexC.location.lngE6/1E6]
  ];
  var poly = L.polygon(latlngs, {
    fillColor: COLORS[team],
    fillOpacity: 0.25,
    stroke: false,
    clickable: false,
    smoothFactor: 10,
    vertices: ent[2].capturedRegion,
    lastUpdate: ent[1],
    guid: ent[0]});

  if(!getPaddedBounds().intersects(poly.getBounds())) return;

  poly.on('remove', function() { delete window.fields[this.options.guid]; });
  poly.on('add',    function() {
    // enable for debugging
    if(window.fields[this.options.guid]) console.warn('duplicate field detected');
    window.fields[this.options.guid] = this;
    this.bringToBack();
  });
  poly.addTo(fieldsLayer);
}


// looks for the GUID in either the layerGroup or entityHash, depending
// on which is faster. Will either return the Leaflet entity or null, if
// it does not exist.
// For example, to find a field use the function like this:
// field = findEntityInLeaflet(fieldsLayer, fields, 'asdasdasd');
window.findEntityInLeaflet = function(layerGroup, entityHash, guid) {
  // fast way
  if(map.hasLayer(layerGroup)) return entityHash[guid] || null;

  // slow way in case the layer is currently hidden
  var ent = null;
  layerGroup.eachLayer(function(entity) {
    if(entity.options.guid !== guid) return true;
    ent = entity;
    return false;
  });
  return ent;
}




// MAP DATA REQUEST CALCULATORS //////////////////////////////////////
// Ingress Intel splits up requests for map data (portals, links,
// fields) into tiles. To get data for the current viewport (i.e. what
// is currently visible) it first calculates which tiles intersect.
// For all those tiles, it then calculates the lat/lng bounds of that
// tile and a quadkey. Both the bounds and the quadkey are “somewhat”
// required to get complete data. No idea how the projection between
// lat/lng and tiles works.
// What follows now are functions that allow conversion between tiles
// and lat/lng as well as calculating the quad key. The variable names
// may be misleading.
// The minified source for this code was in gen_dashboard.js after the
// “// input 89” line (alternatively: the class was called “Xe”).

window.convertCenterLat = function(centerLat) {
  return Math.round(256 * 0.9999 * Math.abs(1 / Math.cos(centerLat * DEG2RAD)));
}

window.calculateR = function(convCenterLat) {
  return 1 << window.map.getZoom() - (convCenterLat / 256 - 1);
}

window.convertLatLngToPoint = function(latlng, magic, R) {
  var x = (magic/2 + latlng.lng * magic / 360)*R;
  var l = Math.sin(latlng.lat * DEG2RAD);
  var y =  (magic/2 + 0.5*Math.log((1+l)/(1-l)) * -(magic / (2*Math.PI)))*R;
  return {x: Math.floor(x/magic), y: Math.floor(y/magic)};
}

window.convertPointToLatLng = function(x, y, magic, R) {
  var e = {};
  e.sw = {
    // orig function put together from all over the place
    // lat: (2 * Math.atan(Math.exp((((y + 1) * magic / R) - (magic/ 2)) / (-1*(magic / (2 * Math.PI))))) - Math.PI / 2) / (Math.PI / 180),
    // shortened version by your favorite algebra program.
    lat: (360*Math.atan(Math.exp(Math.PI - 2*Math.PI*(y+1)/R)))/Math.PI - 90,
    lng: 360*x/R-180
  };
  e.ne = {
    //lat: (2 * Math.atan(Math.exp(((y * magic / R) - (magic/ 2)) / (-1*(magic / (2 * Math.PI))))) - Math.PI / 2) / (Math.PI / 180),
    lat: (360*Math.atan(Math.exp(Math.PI - 2*Math.PI*y/R)))/Math.PI - 90,
    lng: 360*(x+1)/R-180
  };
  return e;
}

// calculates the quad key for a given point. The point is not(!) in
// lat/lng format.
window.pointToQuadKey = function(x, y) {
  var quadkey = [];
  for(var c = window.map.getZoom(); c > 0; c--) {
    //  +-------+   quadrants are probably ordered like this
    //  | 0 | 1 |
    //  |---|---|
    //  | 2 | 3 |
    //  |---|---|
    var quadrant = 0;
    var e = 1 << c - 1;
    (x & e) != 0 && quadrant++;               // push right
    (y & e) != 0 && (quadrant++, quadrant++); // push down
    quadkey.push(quadrant);
  }
  return quadkey.join("");
}

// given quadkey and bounds, returns the format as required by the
// Ingress API to request map data.
window.generateBoundsParams = function(quadkey, bounds) {
  return {
    id: quadkey,
    qk: quadkey,
    minLatE6: Math.round(bounds.sw.lat * 1E6),
    minLngE6: Math.round(bounds.sw.lng * 1E6),
    maxLatE6: Math.round(bounds.ne.lat * 1E6),
    maxLngE6: Math.round(bounds.ne.lng * 1E6)
  };
}


// PLAYER NAMES //////////////////////////////////////////////////////
// Player names are cached in local storage forever. There is no GUI
// element from within the total conversion to clean them, but you
// can run localStorage.clean() to reset it.


// retrieves player name by GUID. If the name is not yet available, it
// will be added to a global list of GUIDs that need to be resolved.
// The resolve method is not called automatically.
window.getPlayerName = function(guid) {
  if(localStorage[guid]) return localStorage[guid];
  // only add to queue if it isn’t already
  if(playersToResolve.indexOf(guid) === -1 && playersInResolving.indexOf(guid) === -1) {
    console.log('resolving player guid=' + guid);
    playersToResolve.push(guid);
  }
  return '{'+guid.slice(0, 12)+'}';
}

// resolves all player GUIDs that have been added to the list. Reruns
// renderPortalDetails when finished, so that then-unresolved names
// get replaced by their correct versions.
window.resolvePlayerNames = function() {
  if(window.playersToResolve.length === 0) return;
  var p = window.playersToResolve;
  var d = {guids: p};
  playersInResolving = window.playersInResolving.concat(p);
  playersToResolve = [];
  postAjax('getPlayersByGuids', d, function(dat) {
    $.each(dat.result, function(ind, player) {
      window.setPlayerName(player.guid, player.nickname);
      // remove from array
      window.playersInResolving.splice(window.playersInResolving.indexOf(player.guid), 1);
    });
    if(window.selectedPortal)
      window.renderPortalDetails(window.selectedPortal);
  },
  function() {
    // append failed resolves to the list again
    console.warn('resolving player guids failed: ' + p.join(', '));
    window.playersToResolve.concat(p);
  });
}


window.setPlayerName = function(guid, nick) {
  if($.trim(('' + nick)).slice(0, 5) === '{"L":' && !window.alertFor37WasShown) {
    window.alertFor37WasShown = true;
    alert('You have run into bug #37. Please help me solve it!\nCopy and paste this text and post it here:\nhttps://github.com/breunigs/ingress-intel-total-conversion/issues/37\nIf copy & pasting doesn’t work, make a screenshot instead.\n\n\n' + window.debug.printStackTrace() + '\n\n\n' + JSON.stringify(nick));
  }
  localStorage[guid] = nick;
}


window.loadPlayerNamesForPortal = function(portal_details) {
  if(map.getZoom() < PRECACHE_PLAYER_NAMES_ZOOM) return;
  var e = portal_details;

  if(e.captured && e.captured.capturingPlayerId)
    getPlayerName(e.captured.capturingPlayerId);

  if(!e.resonatorArray || !e.resonatorArray.resonators) return;

  $.each(e.resonatorArray.resonators, function(ind, reso) {
    if(reso) getPlayerName(reso.ownerGuid);
  });
}


// PORTAL DETAILS MAIN ///////////////////////////////////////////////
// main code block that renders the portal details in the sidebar and
// methods that highlight the portal in the map view.

window.renderPortalDetails = function(guid) {
  if(!window.portals[guid]) {
    unselectOldPortal();
    urlPortal = guid;
    return;
  }

  var d = window.portals[guid].options.details;

  selectPortal(guid);

  // collect some random data that’s not worth to put in an own method
  var links = {incoming: 0, outgoing: 0};
  if(d.portalV2.linkedEdges) $.each(d.portalV2.linkedEdges, function(ind, link) {
    links[link.isOrigin ? 'outgoing' : 'incoming']++;
  });
  function linkExpl(t) { return '<tt title="↳ incoming links\n↴ outgoing links\n• is meant to be the portal.">'+t+'</tt>'; }
  var linksText = [linkExpl('links'), linkExpl(' ↳ ' + links.incoming+'&nbsp;&nbsp;•&nbsp;&nbsp;'+links.outgoing+' ↴')];

  var player = d.captured && d.captured.capturingPlayerId
    ? getPlayerName(d.captured.capturingPlayerId)
    : null;
  var playerText = player ? ['owner', player] : null;

  var time = d.captured ? unixTimeToString(d.captured.capturedTime) : null;
  var sinceText  = time ? ['since', time] : null;

  var linkedFields = ['fields', d.portalV2.linkedFields.length];

  // collect and html-ify random data
  var randDetails = [
    playerText, sinceText, getRangeText(d), getEnergyText(d),
    linksText, getAvgResoDistText(d), linkedFields, getDestroyAP(d)
  ];
  randDetails = '<table id="randdetails">' + genFourColumnTable(randDetails) + '</table>';

  var resoDetails = '<table id="resodetails">' + getResonatorDetails(d) + '</table>';

  setPortalIndicators(d);
  var img = d.imageByUrl && d.imageByUrl.imageUrl ? d.imageByUrl.imageUrl : DEFAULT_PORTAL_IMG;

  var lat = d.locationE6.latE6;
  var lng = d.locationE6.lngE6;
  var perma = 'http://ingress.com/intel?latE6='+lat+'&lngE6='+lng+'&z=17&pguid='+guid;
  var imgTitle = 'title="'+getPortalDescriptionFromDetails(d)+'\n\nClick to show full image."';
  var descObj = d.portalV2.descriptiveText;
  var streetaddress = descObj.ADDRESS;
  var nav = 'http://maps.google.com/?saddr=&daddr='+streetaddress.replace(/ /g,'+')+'&directionsmode=driving';

  $('#portaldetails')
    .attr('class', TEAM_TO_CSS[getTeam(d)])
    .html(''
      + '<h3>'+d.portalV2.descriptiveText.TITLE+'</h3>'
      // help cursor via “.imgpreview img”
      + '<div class="imgpreview" '+imgTitle+' style="background-image: url('+img+')">'
      + '<img class="hide" src="'+img+'"/>'
      + '<span id="level">'+Math.floor(getPortalLevel(d))+'</span>'
      + '</div>'
      + randDetails
      + resoDetails
      + '<div class="linkdetails">'
      + '<aside><a href="'+perma+'">portal link</a></aside>'
      + '<aside><a onclick="window.reportPortalIssue()">report issue</a></aside>'
      + '</div>'
      + '<p style="text-align:center"><a target="_blank" href="'+nav+'">'+shortAddress(streetaddress)+'</a></p>'
    );

  // try to resolve names that were required for above functions, but
  // weren’t available yet.
  resolvePlayerNames();

  runHooks('portalDetailsUpdated', {portalDetails: d});
}

// draws link-range and hack-range circles around the portal with the
// given details.
window.setPortalIndicators = function(d) {
  if(portalRangeIndicator) map.removeLayer(portalRangeIndicator);
  var range = getPortalRange(d);
  var coord = [d.locationE6.latE6/1E6, d.locationE6.lngE6/1E6];
  portalRangeIndicator = (range > 0
      ? L.circle(coord, range, { fill: false, color: RANGE_INDICATOR_COLOR, weight: 3, clickable: false })
      : L.circle(coord, range, { fill: false, stroke: false, clickable: false })
    ).addTo(map);
  if(!portalAccessIndicator)
    portalAccessIndicator = L.circle(coord, HACK_RANGE,
      { fill: false, color: ACCESS_INDICATOR_COLOR, weight: 2, clickable: false }
    ).addTo(map);
  else
    portalAccessIndicator.setLatLng(coord);

}

// highlights portal with given GUID. Automatically clears highlights
// on old selection. Returns false if the selected portal changed.
// Returns true if it’s still the same portal that just needs an
// update.
window.selectPortal = function(guid) {
  var update = selectedPortal === guid;
  var oldPortal = portals[selectedPortal];
  if(!update && oldPortal) portalResetColor(oldPortal);

  selectedPortal = guid;

  if(portals[guid]) {
    resonatorsSetSelectStyle(guid);
    portals[guid].bringToFront().setStyle({color: COLOR_SELECTED_PORTAL});
  }

  return update;
}


window.unselectOldPortal = function() {
  var oldPortal = portals[selectedPortal];
  if(oldPortal) portalResetColor(oldPortal);
  selectedPortal = null;
  $('#portaldetails').html('');
}


// PORTAL DETAILS DISPLAY ////////////////////////////////////////////
// hand any of these functions the details-hash of a portal, and they
// will return pretty, displayable HTML or parts thereof.

// returns displayable text+link about portal range
window.getRangeText = function(d) {
  var range = getPortalRange(d);
  return ['range',
      '<a onclick="window.rangeLinkClick()">'
    + (range > 1000
      ? Math.round(range/1000) + ' km'
      : Math.round(range)      + ' m')
    + '</a>'];
}

// generates description text from details for portal
window.getPortalDescriptionFromDetails = function(details) {
  var descObj = details.portalV2.descriptiveText;
  // FIXME: also get real description?
  var desc = descObj.TITLE + '\n' + descObj.ADDRESS;
  if(descObj.ATTRIBUTION)
    desc += '\nby '+descObj.ATTRIBUTION+' ('+descObj.ATTRIBUTION_LINK+')';
  return desc;
}


// given portal details, returns html code to display mod details.
window.getModDetails = function(d) {
  var mods = [];
  var modsTitle = [];
  var modsColor = [];
  $.each(d.portalV2.linkedModArray, function(ind, mod) {
    if(!mod) {
      mods.push('');
      modsTitle.push('');
      modsColor.push('#000');
    } else if(mod.type === 'RES_SHIELD') {

      var title = mod.rarity.capitalize() + ' ' + mod.displayName + '\n';
      title += 'Installed by: '+ getPlayerName(mod.installingUser);

      title += '\nStats:';
      for (var key in mod.stats) {
        if (!mod.stats.hasOwnProperty(key)) continue;
        title += '\n+' +  mod.stats[key] + ' ' + key.capitalize();
      }

      mods.push(mod.rarity.capitalize().replace('_', ' ') + ' ' + mod.displayName);
      modsTitle.push(title);
      modsColor.push(COLORS_MOD[mod.rarity]);
    } else {
      mods.push(mod.type);
      modsTitle.push('Unknown mod. No further details available.');
      modsColor.push('#FFF');
    }
  });

  var t = '<span'+(modsTitle[0].length ? ' title="'+modsTitle[0]+'"' : '')+' style="color:'+modsColor[0]+'">'+mods[0]+'</span>'
        + '<span'+(modsTitle[1].length ? ' title="'+modsTitle[1]+'"' : '')+' style="color:'+modsColor[1]+'">'+mods[1]+'</span>'
        + '<span'+(modsTitle[2].length ? ' title="'+modsTitle[2]+'"' : '')+' style="color:'+modsColor[2]+'">'+mods[2]+'</span>'
        + '<span'+(modsTitle[3].length ? ' title="'+modsTitle[3]+'"' : '')+' style="color:'+modsColor[3]+'">'+mods[3]+'</span>'

  return t;
}

window.getEnergyText = function(d) {
  var currentNrg = getCurrentPortalEnergy(d);
  var totalNrg = getTotalPortalEnergy(d);
  var inf = currentNrg + ' / ' + totalNrg;
  var fill = prettyEnergy(currentNrg) + ' / ' + prettyEnergy(totalNrg)
  return ['energy', '<tt title="'+inf+'">' + fill + '</tt>'];
}

window.getAvgResoDistText = function(d) {
  var avgDist = Math.round(10*getAvgResoDist(d))/10;
  return ['reso dist', avgDist + ' m'];
}

window.getResonatorDetails = function(d) {
  var resoDetails = [];
  // octant=slot: 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, SE=7
  // resos in the display should be ordered like this:
  //   N    NE         Since the view is displayed in columns, they
  //  NW    E          need to be ordered like this: N, NW, W, SW, NE,
  //   W    SE         E, SE, S, i.e. 2 3 4 5 1 0 7 6
  //  SW    S

  $.each([2, 1, 3, 0, 4, 7, 5, 6], function(ind, slot) {
    var reso = d.resonatorArray.resonators[slot];
    if(!reso) {
      resoDetails.push(renderResonatorDetails(slot, 0, 0, null, null));
      return true;
    }

    var l = parseInt(reso.level);
    var v = parseInt(reso.energyTotal);
    var nick = window.getPlayerName(reso.ownerGuid);
    var dist = reso.distanceToPortal;
    // if array order and slot order drift apart, at least the octant
    // naming will still be correct.
    slot = parseInt(reso.slot);

    resoDetails.push(renderResonatorDetails(slot, l, v, dist, nick));
  });
  return genFourColumnTable(resoDetails);
}

// helper function that renders the HTML for a given resonator. Does
// not work with raw details-hash. Needs digested infos instead:
// slot: which slot this resonator occupies. Starts with 0 (east) and
// rotates clockwise. So, last one is 7 (southeast).
window.renderResonatorDetails = function(slot, level, nrg, dist, nick) {
  if(level === 0) {
    var meter = '<span class="meter" title="octant:\t' + OCTANTS[slot] + '"></span>';
  } else {
    var max = RESO_NRG[level];
    var fillGrade = nrg/max*100;

    var inf = 'energy:\t' + nrg   + ' / ' + max + ' (' + Math.round(fillGrade) + '%)\n'
            + 'level:\t'  + level + '\n'
            + 'distance:\t' + dist  + 'm\n'
            + 'owner:\t'  + nick  + '\n'
            + 'octant:\t' + OCTANTS[slot];

    var style = 'width:'+fillGrade+'%; background:'+COLORS_LVL[level]+';';

    var color = (level < 3 ? "#9900FF" : "#FFFFFF");

    var lbar = '<span class="meter-level" style="color: ' + color + ';"> ' + level + ' </span>';

    var fill  = '<span style="'+style+'"></span>';

    var meter = '<span class="meter" title="'+inf+'">' + fill + lbar + '</span>';
  }
  return [meter, nick || ''];
}

// calculate AP gain from destroying portal
// so far it counts only resonators + links
window.getDestroyAP = function(d) {
  var resoCount = 0;

  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) return true;
    resoCount += 1;
  });

  var linkCount = d.portalV2.linkedEdges ? d.portalV2.linkedEdges.length : 0;
  var fieldCount = d.portalV2.linkedFields ? d.portalV2.linkedFields.length : 0;

  var resoAp = resoCount * DESTROY_RESONATOR;
  var linkAp = linkCount * DESTROY_LINK;
  var fieldAp = fieldCount * DESTROY_FIELD;
  var sum = resoAp + linkAp + fieldAp + CAPTURE_PORTAL + 8*DEPLOY_RESONATOR + COMPLETION_BONUS;

  function tt(text) {
    var t = 'Destroy &amp; Capture:\n';
    t += resoCount  + '×\tResonators\t= ' + digits(resoAp) + '\n';
    t += linkCount  + '×\tLinks\t= ' + digits(linkAp) + '\n';
    t += fieldCount + '×\tFields\t= ' + digits(fieldAp) + '\n';
    t += '1×\tCapture\t= ' + CAPTURE_PORTAL + '\n';
    t += '8×\tDeploy\t= ' + (8*DEPLOY_RESONATOR) + '\n';
    t += '1×\tBonus\t= ' + COMPLETION_BONUS + '\n';
    t += 'Sum: ' + digits(sum) + ' AP';
    return '<tt title="'+t+'">' + digits(text) + '</tt>';
  }

  return [tt('AP Gain'), tt(sum)];
}




// PORTAL DETAILS TOOLS //////////////////////////////////////////////
// hand any of these functions the details-hash of a portal, and they
// will return useful, but raw data.

// returns a float. Displayed portal level is always rounded down from
// that value.
window.getPortalLevel = function(d) {
  var lvl = 0;
  var hasReso = false;
  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) return true;
    lvl += parseInt(reso.level);
    hasReso = true;
  });
  return hasReso ? Math.max(1, lvl/8) : 0;
}

window.getTotalPortalEnergy = function(d) {
  var nrg = 0;
  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) return true;
    var level = parseInt(reso.level);
    var max = RESO_NRG[level];
    nrg += max;
  });
  return nrg;
}

// For backwards compatibility
window.getPortalEnergy = window.getTotalPortalEnergy;

window.getCurrentPortalEnergy = function(d) {
  var nrg = 0;
  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) return true;
    nrg += parseInt(reso.energyTotal);
  });
  return nrg;
}

window.getPortalRange = function(d) {
  // formula by the great gals and guys at
  // http://decodeingress.me/2012/11/18/ingress-portal-levels-and-link-range/

  var lvl = 0;
  var resoMissing = false;
  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) {
      resoMissing = true;
      return false;
    }
    lvl += parseInt(reso.level);
  });
  if(resoMissing) return 0;
  return 160*Math.pow(getPortalLevel(d), 4);
}

window.getAvgResoDist = function(d) {
  var sum = 0, resos = 0;
  $.each(d.resonatorArray.resonators, function(ind, reso) {
    if(!reso) return true;
    sum += parseInt(reso.distanceToPortal);
    resos++;
  });
  return sum/resos;
}




// REDEEMING /////////////////////////////////////////////////////////

window.handleRedeemResponse = function(data, textStatus, jqXHR) {
  if (data.error) {
    var error = '';
    if (data.error === 'ALREADY_REDEEMED') {
      error = 'The passcode has already been redeemed.';
    } else if (data.error === 'ALREADY_REDEEMED_BY_PLAYER') {
      error = 'You have already redeemed this passcode.';
    } else if (data.error === 'INVALID_PASSCODE') {
      error = 'This passcode is invalid.';
    } else {
      error = 'The passcode cannot be redeemed.';
    }
    alert("Error: " + data.error + "\n" + error);
  } else if (data.result) {
    var res_level = 0, res_count = 0;
    var xmp_level = 0, xmp_count = 0;
    var shield_rarity = '', shield_count = 0;

    // This assumes that each passcode gives only one type of resonator/XMP/shield.
    // This may break at some point, depending on changes to passcode functionality.
    for (var i in data.result.inventoryAward) {
      var acquired = data.result.inventoryAward[i][2];
      if (acquired.modResource) {
        if (acquired.modResource.resourceType === 'RES_SHIELD') {
          shield_rarity = acquired.modResource.rarity.split('_').map(function (i) {return i[0]}).join('');
          shield_count++;
        }
      } else if (acquired.resourceWithLevels) {
        if (acquired.resourceWithLevels.resourceType === 'EMITTER_A') {
          res_level = acquired.resourceWithLevels.level;
          res_count++;
        } else if (acquired.resourceWithLevels.resourceType === 'EMP_BURSTER') {
          xmp_level = acquired.resourceWithLevels.level;
          xmp_count++;
        }
      }
    }

    alert("Passcode redeemed!\n" + [data.result.apAward + 'AP', data.result.xmAward + 'XM', res_count + 'xL' + res_level + ' RES', xmp_count + 'xL' + xmp_level + ' XMP', shield_count + 'x' + shield_rarity + ' SHIELD'].join('/'));
  }
}

window.setupRedeem = function() {
  $("#redeem").keypress(function(e) {
    if((e.keyCode ? e.keyCode : e.which) != 13) return;
    var data = {passcode: $(this).val()};
    window.postAjax('redeemReward', data, window.handleRedeemResponse,
      function() { alert('HTTP request failed. Try again?'); });
  });
}



// REQUEST HANDLING //////////////////////////////////////////////////
// note: only meant for portal/links/fields request, everything else
// does not count towards “loading”

window.activeRequests = [];
window.failedRequestCount = 0;

window.requests = function() {}

window.requests.add = function(ajax) {
  window.activeRequests.push(ajax);
  renderUpdateStatus();
}

window.requests.remove = function(ajax) {
  window.activeRequests.splice(window.activeRequests.indexOf(ajax), 1);
  renderUpdateStatus();
}

window.requests.abort = function() {
  $.each(window.activeRequests, function(ind, actReq) {
    if(actReq) actReq.abort();
  });

  window.activeRequests = [];
  window.failedRequestCount = 0;
  window.chat._requestPublicRunning  = false;
  window.chat._requestFactionRunning  = false;

  renderUpdateStatus();
}

// gives user feedback about pending operations. Draws current status
// to website. Updates info in layer chooser.
window.renderUpdateStatus = function() {
  var t = '<b>map status:</b> ';
  if(mapRunsUserAction)
    t += 'paused during interaction';
  else if(isIdle())
    t += '<span style="color:red">Idle, not updating.</span>';
  else if(window.activeRequests.length > 0)
    t += window.activeRequests.length + ' requests running.';
  else
    t += 'Up to date.';

  if(renderLimitReached())
    t += ' <span style="color:red" class="help" title="Can only render so much before it gets unbearably slow. Not all entities are shown. Zoom in or increase the limit (search for MAX_DRAWN_*).">RENDER LIMIT</span> '

  if(window.failedRequestCount > 0)
    t += ' <span style="color:red">' + window.failedRequestCount + ' failed</span>.'

  t += '<br/>(';
  var minlvl = getMinPortalLevel();
  if(minlvl === 0)
    t += 'loading all portals';
  else
    t+= 'only loading portals with level '+minlvl+' and up';
  t += ')';

  var portalSelection = $('.leaflet-control-layers-overlays label');
  portalSelection.slice(0, minlvl+1).addClass('disabled').attr('title', 'Zoom in to show those.');
  portalSelection.slice(minlvl, 8).removeClass('disabled').attr('title', '');


  $('#updatestatus').html(t);
}


// sets the timer for the next auto refresh. Ensures only one timeout
// is queued. May be given 'override' in milliseconds if time should
// not be guessed automatically. Especially useful if a little delay
// is required, for example when zooming.
window.startRefreshTimeout = function(override) {
  // may be required to remove 'paused during interaction' message in
  // status bar
  window.renderUpdateStatus();
  if(refreshTimeout) clearTimeout(refreshTimeout);
  var t = 0;
  if(override) {
    t = override;
  } else {
    t = REFRESH*1000;
    var adj = ZOOM_LEVEL_ADJ * (18 - window.map.getZoom());
    if(adj > 0) t += adj*1000;
  }
  var next = new Date(new Date().getTime() + t).toLocaleTimeString();
  console.log('planned refresh: ' + next);
  refreshTimeout = setTimeout(window.requests._callOnRefreshFunctions, t);
}

window.requests._onRefreshFunctions = [];
window.requests._callOnRefreshFunctions = function() {
  startRefreshTimeout();

  if(isIdle()) {
    console.log('user has been idle for ' + idleTime + ' minutes. Skipping refresh.');
    renderUpdateStatus();
    return;
  }

  console.log('refreshing');

  $.each(window.requests._onRefreshFunctions, function(ind, f) {
    f();
  });
}


// add method here to be notified of auto-refreshes
window.requests.addRefreshFunction = function(f) {
  window.requests._onRefreshFunctions.push(f);
}


window.isSmartphone = function() {
  // this check is also used in main.js. Note it should not detect
  // tablets because their display is large enough to use the desktop
  // version.
  return navigator.userAgent.match(/Android.*Mobile/);
}

window.smartphone = function() {};

window.runOnSmartphonesBeforeBoot = function() {
  if(!isSmartphone()) return;
  console.warn('running smartphone pre boot stuff');

  // disable zoom buttons to see if they are really needed
  window.localStorage['iitc.zoom.buttons'] = 'false';

  // don’t need many of those
  window.setupStyles = function() {
    $('head').append('<style>' +
      [ '#largepreview.enl img { border:2px solid '+COLORS[TEAM_ENL]+'; } ',
        '#largepreview.res img { border:2px solid '+COLORS[TEAM_RES]+'; } ',
        '#largepreview.none img { border:2px solid '+COLORS[TEAM_NONE]+'; } '].join("\n")
      + '</style>');
  }

  // this also matches the expand button, but it is hidden via CSS
  $('#chatcontrols a').click(function() {
    $('#scrollwrapper, #updatestatus').hide();
    // not displaying the map causes bugs in Leaflet
    $('#map').css('visibility', 'hidden');
    $('#chat, #chatinput').show();
  });

  window.smartphone.mapButton = $('<a>map</a>').click(function() {
    $('#chat, #chatinput, #scrollwrapper').hide();
    $('#map').css('visibility', 'visible');
    $('#updatestatus').show();
    $('.active').removeClass('active');
    $(this).addClass('active');
  });

  window.smartphone.sideButton = $('<a>info</a>').click(function() {
    $('#chat, #chatinput, #updatestatus').hide();
    $('#map').css('visibility', 'hidden');
    $('#scrollwrapper').show();
    $('.active').removeClass('active');
    $(this).addClass('active');
  });

  $('#chatcontrols').append(smartphone.mapButton).append(smartphone.sideButton);

  // add event to portals that allows long press to switch to sidebar
  window.addHook('portalAdded', function(data) {
    data.portal.on('dblclick', function() {
      window.lastClickedPortal = this.options.guid;
    });
  });

  window.addHook('portalDetailsUpdated', function(data) {
    var x = $('.imgpreview img').removeClass('hide');

    if(!x.length) {
      $('.fullimg').remove();
      return;
    }

    if($('.fullimg').length) {
      $('.fullimg').replaceWith(x.addClass('fullimg'));
    } else {
      x.addClass('fullimg').appendTo('#sidebar');
    }
  });
}

window.runOnSmartphonesAfterBoot = function() {
  if(!isSmartphone()) return;
  console.warn('running smartphone post boot stuff');

  chat.toggle();
  smartphone.mapButton.click();

  // disable img full view
  $('#portaldetails').off('click', '**');

  $('.leaflet-right').addClass('leaflet-left').removeClass('leaflet-right');
}




// UTILS + MISC  ///////////////////////////////////////////////////////

// retrieves parameter from the URL?query=string.
window.getURLParam = function(param) {
  var v = document.URL;
  var i = v.indexOf(param);
  if(i <= -1) return '';
  v = v.substr(i);
  i = v.indexOf("&");
  if(i >= 0) v = v.substr(0, i);
  return v.replace(param+"=","");
}

// read cookie by name.
// http://stackoverflow.com/a/5639455/1684530 by cwolves
var cookies;
window.readCookie = function(name,c,C,i){
  if(cookies) return cookies[name];
  c = document.cookie.split('; ');
  cookies = {};
  for(i=c.length-1; i>=0; i--){
    C = c[i].split('=');
    cookies[C[0]] = unescape(C[1]);
  }
  return cookies[name];
}

window.writeCookie = function(name, val) {
  document.cookie = name + "=" + val + '; expires=Thu, 31 Dec 2020 23:59:59 GMT; path=/';
}

// add thousand separators to given number.
// http://stackoverflow.com/a/1990590/1684530 by Doug Neiner.
window.digits = function(d) {
  return (d+"").replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1 ");
}

// posts AJAX request to Ingress API.
// action: last part of the actual URL, the rpc/dashboard. is
//         added automatically
// data: JSON data to post. method will be derived automatically from
//       action, but may be overridden. Expects to be given Hash.
//       Strings are not supported.
// success: method to call on success. See jQuery API docs for avail-
//          able arguments: http://api.jquery.com/jQuery.ajax/
// error: see above. Additionally it is logged if the request failed.
window.postAjax = function(action, data, success, error) {
  data = JSON.stringify($.extend({method: 'dashboard.'+action}, data));
  var remove = function(data, textStatus, jqXHR) { window.requests.remove(jqXHR); };
  var errCnt = function(jqXHR) { window.failedRequestCount++; window.requests.remove(jqXHR); };
  return $.ajax({
    // use full URL to avoid issues depending on how people set their
    // slash. See:
    // https://github.com/breunigs/ingress-intel-total-conversion/issues/56
    url: 'http://www.ingress.com/rpc/dashboard.'+action,
    type: 'POST',
    data: data,
    dataType: 'json',
    success: [remove, success],
    error: error ? [errCnt, error] : errCnt,
    contentType: 'application/json; charset=utf-8',
    beforeSend: function(req) {
      req.setRequestHeader('X-CSRFToken', readCookie('csrftoken'));
    }
  });
}

// converts unix timestamps to HH:mm:ss format if it was today;
// otherwise it returns YYYY-MM-DD
window.unixTimeToString = function(time, full) {
  if(!time) return null;
  var d = new Date(typeof time === 'string' ? parseInt(time) : time);
  var time = d.toLocaleTimeString();
  var date = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  if(typeof full !== 'undefined' && full) return date + ' ' + time;
  if(d.toDateString() == new Date().toDateString())
    return time;
  else
    return date;
}

window.unixTimeToHHmm = function(time) {
  if(!time) return null;
  var d = new Date(typeof time === 'string' ? parseInt(time) : time);
  var h = '' + d.getHours(); h = h.length === 1 ? '0' + h : h;
  var s = '' + d.getMinutes(); s = s.length === 1 ? '0' + s : s;
  return  h + ':' + s;
}

window.rangeLinkClick = function() {
  if(window.portalRangeIndicator)
    window.map.fitBounds(window.portalRangeIndicator.getBounds());
  if(window.isSmartphone)
    window.smartphone.mapButton.click();
}

window.reportPortalIssue = function(info) {
  var t = 'Redirecting you to a Google Help Page. Once there, click on “Contact Us” in the upper right corner.\n\nThe text box contains all necessary information. Press CTRL+C to copy it.';
  var d = window.portals[window.selectedPortal].options.details;

  var info = 'Your Nick: ' + PLAYER.nickname + '        '
    + 'Portal: ' + d.portalV2.descriptiveText.TITLE + '        '
    + 'Location: ' + d.portalV2.descriptiveText.ADDRESS
    +' (lat ' + (d.locationE6.latE6/1E6) + '; lng ' + (d.locationE6.lngE6/1E6) + ')';

  //codename, approx addr, portalname
  if(prompt(t, info) !== null)
    window.open('https://support.google.com/ingress?hl=en');
}

window._storedPaddedBounds = undefined;
window.getPaddedBounds = function() {
  if(_storedPaddedBounds === undefined) {
    map.on('zoomstart zoomend movestart moveend', function() {
      window._storedPaddedBounds = null;
    });
  }
  if(window._storedPaddedBounds) return window._storedPaddedBounds;

  var p = window.map.getBounds().pad(VIEWPORT_PAD_RATIO);
  window._storedPaddedBounds = p;
  return p;
}

window.renderLimitReached = function() {
  if(Object.keys(portals).length >= MAX_DRAWN_PORTALS) return true;
  if(Object.keys(links).length >= MAX_DRAWN_LINKS) return true;
  if(Object.keys(fields).length >= MAX_DRAWN_FIELDS) return true;
  return false;
}

window.getMinPortalLevel = function() {
  var z = map.getZoom();
  if(z >= 16) return 0;
  var conv = ['impossible', 8,7,7,6,6,5,5,4,4,3,3,2,2,1,1];
  return conv[z];
}

// returns number of pixels left to scroll down before reaching the
// bottom. Works similar to the native scrollTop function.
window.scrollBottom = function(elm) {
  if(typeof elm === 'string') elm = $(elm);
  return elm.get(0).scrollHeight - elm.innerHeight() - elm.scrollTop();
}

window.zoomToAndShowPortal = function(guid, latlng) {
  map.setView(latlng, 17);
  // if the data is available, render it immediately. Otherwise defer
  // until it becomes available.
  if(window.portals[guid])
    renderPortalDetails(guid);
  else
    urlPortal = guid;
}

// translates guids to entity types
window.getTypeByGuid = function(guid) {
  // portals end in “.11” or “.12“, links in “.9", fields in “.b”
  // .11 == portals
  // .12 == portals
  // .9  == links
  // .b  == fields
  // .c  == player/creator
  // .d  == chat messages
  //
  // others, not used in web:
  // .5  == resources (burster/resonator)
  // .6  == XM
  // .4  == media items, maybe all droppped resources (?)
  // resonator guid is [portal guid]-resonator-[slot]
  switch(guid.slice(33)) {
    case '11':
    case '12':
      return TYPE_PORTAL;

    case '9':
      return TYPE_LINK;

    case 'b':
      return TYPE_FIELD;

    case 'c':
      return TYPE_PLAYER;

    case 'd':
      return TYPE_CHAT;

    default:
      if(guid.slice(-11,-2) == 'resonator') return TYPE_RESONATOR;
      return TYPE_UNKNOWN;
  }
}

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
}

// http://stackoverflow.com/a/646643/1684530 by Bergi and CMS
if (typeof String.prototype.startsWith !== 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) === str;
  };
}

window.prettyEnergy = function(nrg) {
  return nrg> 1000 ? Math.round(nrg/1000) + ' k': nrg;
}

window.setPermaLink = function(elm) {
  var c = map.getCenter();
  var lat = Math.round(c.lat*1E6);
  var lng = Math.round(c.lng*1E6);
  var qry = 'latE6='+lat+'&lngE6='+lng+'&z=' + (map.getZoom()-1);
  $(elm).attr('href',  'http://www.ingress.com/intel?' + qry);
}

window.uniqueArray = function(arr) {
  return $.grep(arr, function(v, i) {
    return $.inArray(v, arr) === i;
  });
}

window.genFourColumnTable = function(blocks) {
  var t = $.map(blocks, function(detail, index) {
    if(!detail) return '';
    if(index % 2 === 0)
      return '<tr><td>'+detail[1]+'</td><th>'+detail[0]+'</th>';
    else
      return '    <th>'+detail[0]+'</th><td>'+detail[1]+'</td></tr>';
  }).join('');
  if(t.length % 2 === 1) t + '<td></td><td></td></tr>';
  return t;
}

window.shortAddress = function(addr) {
  var shortaddr = addr
    .replace(' Road,',    ' Rd,')
    .replace(' Street,',  ' St,')
    .replace(' Drive,',   ' Dr,')
    .replace(' Avenue,',  ' Ave,')
    .replace(/ (NSW|VIC|QLD|TAS|SA|WA|ACT)( \d{4})?, Australia$/,'$2');
  return shortaddr;
}





} // end of wrapper

// inject code into site context
var script = document.createElement('script');
script.appendChild(document.createTextNode('('+ wrapper +')();'));
(document.body || document.head || document.documentElement).appendChild(script);
