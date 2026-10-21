'use strict';
// Test-process arguments only; never changes an installed/personal Chrome profile.
// Official Chromium switches: chrome/common/chrome_switches.h (.cc for cache).
// https://github.com/chromium/chromium/blob/main/chrome/common/chrome_switches.h
module.exports={cacheLimits:Object.freeze(['--disable-component-update','--disk-cache-size=1048576','--media-cache-size=1048576'])};
