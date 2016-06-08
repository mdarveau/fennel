/*-----------------------------------------------------------------------------
 **
 ** - Fennel Card-/CalDAV -
 **
 ** Copyright 2014 by
 ** SwordLord - the coding crew - http://www.swordlord.com
 ** and contributing authors
 **
 -----------------------------------------------------------------------------*/

var log = require('../libs/log').log;
var userLib = require('../libs/user');
var url = require('url');
var xml = require("libxmljs");

// Exporting.
module.exports = {
    request: request
};

function request(req, res)
{
    
    this.req = req;
    this.res = res;
    
    // this.res.writeHead = function(status){
    //     this.responseStatus = status;
    // }.bind( this );
    
    this.response = "";
    this.res.write = function(data){
        this.response += data;
    }.bind( this );

    var header = req.headers['authorization']||'';        // get the header
    var token = header.split(/\s+/).pop()||'';            // and the encoded auth token
    var auth = new Buffer(token, 'base64').toString();    // convert from base64
    var parts = auth.split(/:/);                          // split on colon
    var username = parts[0];

    this.user = new userLib.user(username);

    this.closeResAutomatically = true;

    return this;
}

request.prototype.dontCloseResAutomatically = function()
{
    this.closeResAutomatically = false;
};

request.prototype.closeResponseAutomatically = function()
{
    if(this.closeResAutomatically)
    {
        this.closeRes();
    }
};

request.prototype.closeRes = function()
{
    // Format output for log
    this.response = xml.parseXml( this.response ).toString();
    if(this.responseStatus != null) {
        console.log("Returning status: " + this.responseStatus);
        this.res.status( this.responseStatus );
    }
    console.log("Returning response: " + this.response);
    this.res.write(this.response);
    this.res.end();
    // this.res.end();
};


request.prototype.getUser = function()
{
    return this.user;
};

/*
request.prototype.setUser = function(user)
{
    this.user = user;
};
*/

request.prototype.getReq = function()
{
    return this.req;
};

request.prototype.getRes = function()
{
    return this.res;
};

request.prototype.getBody = function()
{
    return this.req.body;
};

request.prototype.getXml = function()
{
    // Make sure we parse the XML only once
    if(this.xmlBody == null) {
        this.xmlBody = xml.parseXml( this.req.body );
    }
    return this.xmlBody;
};

request.prototype.getURL = function()
{
    return this.req.url;
};

// FIXME @mdarveau Check if used
request.prototype.getURLAsArray = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        log.warn('Something evil happened in calendar.put!');
        return undefined;
    }

    return aUrl;
};

// FIXME @mdarveau This will not work with root path other than /
request.prototype.getFilenameFromPath = function(removeEnding)
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        log.warn('Something evil happened in calendar.put!');
        return undefined;
    }

    var filename = aUrl[aUrl.length - 1];

    if(removeEnding)
    {
        filename = filename.substr(0, filename.length - 4);
    }

    return filename;
};

request.prototype.getLastPathElement = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        log.warn('Something evil happened in calendar.put!');
        return undefined;
    }

    return aUrl[aUrl.length - 2];
};

request.prototype.getPathElement = function(position)
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    if(aUrl.length <= 0)
    {
        log.warn('Something evil happened in calendar.put!');
        return undefined;
    }

    return aUrl[position];
};

request.prototype.getUrlElementSize = function()
{
    var aUrl = url.parse(this.req.url).pathname.split("/");
    return aUrl.length;
};

request.prototype.stringEndsWith = function(str, suffix)
{
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
};
