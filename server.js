/*-----------------------------------------------------------------------------
 **
 ** - Fennel Card-/CalDAV -
 **
 ** Copyright 2014-15 by
 ** SwordLord - the coding crew - http://www.swordlord.com
 ** and contributing authors
 **
 ** This program is free software; you can redistribute it and/or modify it
 ** under the terms of the GNU General Public License as published by the Free
 ** Software Foundation, either version 3 of the License, or (at your option)
 ** any later version.
 **
 ** This program is distributed in the hope that it will be useful, but WITHOUT
 ** ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 ** FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
 ** more details.
 **
 ** You should have received a copy of the GNU General Public License along
 ** with this program. If not, see <http://www.gnu.org/licenses/>.
 **
 **-----------------------------------------------------------------------------
 **
 ** Original Authors:
 ** LordEidi@swordlord.com
 ** LordLightningBolt@swordlord.com
 **
 ** $Id:
 **
-----------------------------------------------------------------------------*/
var config = require('./config').config;
var authlib = require('./libs/authentication');
var log = require('./libs/log').log;
var reqlib = require('./libs/request');

var path = require('path');
var url = require('url');
var httpauth = require('http-auth');
var express = require('express');
var app = express();

//
// Configure auth
//
var basic = httpauth.basic(
    {
        realm: "Fennel"
    }, function (username, password, callback)
    {
        authlib.checkLogin(username, password, callback);
    }
);
app.use(httpauth.connect(basic));

//
// Get the request body
//
var bodyParser = require('body-parser');
app.use(bodyParser.text({
    type: '*/*'
}));

//
// Configure logging
//
if ( process.env.LOG_HTTP !== 'false' ) {
    var winston = require( 'winston' );
    var expressWinston = require( 'express-winston' );
    
    // LOG_HTTP_BODY==true enabled full HTTP logging
    if (process.env.LOG_HTTP_BODY === 'true') {
        log.info("HTTP body logging is enabled. Set LOG_HTTP_BODY=false to turn off.");
        expressWinston.requestWhitelist.push( 'body' );
        expressWinston.responseWhitelist.push( 'body' );
    } else {
        log.info("HTTP body logging is disabled. Set LOG_HTTP_BODY=true to turn on.");
    }
    
    log.info("HTTP body logging is enabled. Set LOG_HTTP=false to turn off.");
    var logger = expressWinston.logger( {
        transports: [new winston.transports.Console( {
            json: false,
            stringify: !(process.env.LOG_HTTP_PRETTY === 'true' || (process.env.NODE_ENV !== 'production' && process.env.LOG_HTTP_PRETTY !== 'false')),
            colorize: true
        } )],
        meta: true,
        msg: "HTTP {{req.method}} {{req.url}} -> {{res.statusCode}} in {{res.responseTime}}ms", 
        expressFormat: false 
    } );
    app.use(logger);
} else {
    log.info("HTTP logging is disabled. Set LOG_HTTP=true to turn on.");
}

// The root path where the calendar should be served. Default to / but could be /cal or anything else  
var rootPath = "/";

// Root
var rootRedirect = function (req, res) {
    // clients which do not call the .well-known URL call the root directory
    // these clients should be redirected to the principal URL as well...(?)
    log.debug( "Called the root. Redirecting to /p/" );

    res.set({
        'Location': '/p/'
        //add other headers here...?
    });
    res.status(302).end();
};
app.get(rootPath, rootRedirect);
app.propfind(rootPath, rootRedirect);

// .well-known
app.get(path.join(rootPath, '.well-known'), function (req, res) {
    log.debug("Called .well-known URL for " + req.url + ". Redirecting to /p/");

    res.set({
        'Location': '/p/'
        //add other headers here...?
    });
    res.status(302).end();
});

// Handlers routes
var setupHandlerRoute = function( handler, method ){
    return function ( req, res ) {
        var request = new reqlib.request( req, res );
        handler[method]( request );
        request.closeResponseAutomatically();
    }
};
var setupHandlerRoutes = function( handler, handlerPath ){
    var handlerPath = path.join( rootPath, handlerPath );
    for (var method in handler) {
        console.log("Adding route " + method.toUpperCase() + " " + handlerPath);
        app[method]( handlerPath, setupHandlerRoute(handler, method) );
    }
};
setupHandlerRoutes(require( "./handler/principal" ), 'p*');
setupHandlerRoutes(require( "./handler/calendar" ), 'cal*');
setupHandlerRoutes(require( "./handler/addressbook" ), 'card*');

app.use(function(err, req, res, next) {
  log.error(err.stack);
  res.status(500).send('Something broke!');
});

// Listen on port 8888, IP defaults to 127.0.0.1
app.listen(config.port, function () {
    // Put a friendly message on the terminal
    log.info("Server running at http://" + config.ip + ":" + config.port + "/");
});

