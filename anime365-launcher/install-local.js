/* Runs inside the existing TizenBrew TV service. No network or account access. */
(function () {
    'use strict';
    var fs = require('fs');
    var source = '/home/owner/share/tmp/sdk_tools/anime365.html';
    var destination = '/home/owner/share/anime365.html';
    if (fs.existsSync(destination) && fs.statSync(destination).size > 1000) return;
    if (!fs.existsSync(source)) throw new Error('Missing local Anime365 page; installation is incomplete');
    fs.writeFileSync(destination, fs.readFileSync(source));
})();
