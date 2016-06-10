/*-----------------------------------------------------------------------------
 **
 ** - Fennel Card-/CalDAV -
 **
 ** Copyright 2014-15 by
 ** SwordLord - the coding crew - http://www.swordlord.com
 ** and contributing authors
 **
 -----------------------------------------------------------------------------*/

var rh = require("../libs/responsehelper");
var xh = require("../libs/xmlhelper");
var log = require('../libs/log').log;
var ICS = require('../libs/db').ICS;
var CAL = require('../libs/db').CAL;

// Exporting.
module.exports = {
    propfind: propfind,
    proppatch: proppatch,
    report: report,
    options: options,
    mkcalendar: makeCalendar,
    put: put,
    get: gett,
    delete: del,
    move: move
};

function del(request)
{
    log.debug("calendar.delete called");

    var res = request.getRes();
    res.set("Content-Type", "text/html");
    res.set("Server", "Fennel");

    var isRoot = true;

    // FIXME @mdarveau This will not work with root path other than /
    // if URL element size === 4, this is a call for the root URL of a user.
    // TODO: check if the current user is the user requesting the resource (ACL)
    if(request.getUrlElementSize() > 4)
    {
        var lastPathElement = request.getFilenameFromPath(false);
        if(request.stringEndsWith(lastPathElement, '.ics'))
        {
            isRoot = false;
        }
    }

    if(isRoot === true)
    {
        // FIXME @mdarveau This will not work with root path other than /
        var calendarId = request.getPathElement(3);

        CAL.find({ where: {pkey: calendarId} }).then(function(cal)
        {
            if(cal === null)
            {
                log.warn('err: could not find calendar');
            }
            else
            {
                cal.destroy().then(function()
                {
                    log.debug('calendar deleted');
                })
            }

            res.sendStatus(204);
        });
    }
    else
    {
        var ics_id = request.getFilenameFromPath(true);

        ICS.find( { where: {pkey: ics_id}}).then(function(ics)
        {
            if(ics === null)
            {
                log.warn('err: could not find ics');
            }
            else
            {
                ics.destroy().then(function()
                {
                    log.debug('ics deleted');
                })
            }

            res.sendStatus(204);
        });
    }

}

function gett(request)
{
    log.debug("calendar.get called");

    var res = request.getRes();
    res.set("Content-Type", "text/calendar");

    var ics_id = request.getFilenameFromPath(true);
    ICS.find( { where: {pkey: ics_id}}).then(function(ics)
    {
        if(ics === null)
        {
            log.warn('err: could not find ics');
            request.end();
        }
        else
        {
            var res = request.getRes();

            var content = ics.content;
            //content = content.replace(/\r\n|\r|\n/g,'&#13;\r\n');

            res.send(content);
        }

    });
}

function put(request)
{
    log.debug("calendar.put called");

    var ics_id = request.getFilenameFromPath(true);
    var calendar = request.getLastPathElement();

    var defaults = {
        calendarId: calendar,
        content: request.getBody()
    };

    ICS.findOrCreate({ where: {pkey: ics_id}, defaults: defaults}).spread(function(ics, created)
        {
            if(created)
            {
                log.debug('Created ICS: ' + JSON.stringify(ics, null, 4));
            }
            else
            {
                ics.content = request.getBody();
                log.debug('Loaded ICS: ' + JSON.stringify(ics, null, 4));
            }

            ics.save().then(function()
            {
                log.info('ics updated');

                // update calendar collection
                CAL.findOne({ where: {pkey: calendar} } ).then(function(cal)
                {
                    if(cal !== null && cal !== undefined)
                    {
                        cal.increment('synctoken', { by: 1 }).then(function()
                        {
                            log.info('synctoken on cal updated');
                            rh.setStandardHeaders(request);
                            var res = request.getRes();
                            res.set("ETag", Number(new Date()));
                            res.sendStatus(201);
                        });
                    }
                });
            });
        });
}

function move(request)
{
    log.debug("calendar.move called");

    rh.setStandardHeaders(request);

    var ics_id = request.getFilenameFromPath(true);
    var calendar = request.getLastPathElement();

    var destination = "";

    var req = request.getReq();
    var headers = req.headers;
    for(var header in headers)
    {
        if(header === "destination")
        {
            destination = req.headers[header];
        }
    }

    if(destination.length > 0)
    {
        var aURL = destination.split("/");
        var newCal = aURL[aURL.length - 2];

        ICS.find({ where: {pkey: ics_id} }).then(function(ics)
        {
            if(ics === null)
            {
                log.warn('ics not found');
                res.sendStatus(404);
            }
            else
            {
                ics.calendarId = newCal;
                ics.save().then(function()
                {
                    log.warn('ics updated');
                    rh.setStandardHeaders(request);
                    request.getRes().sendStatus(201);
                });
            }
        });
    } else {
        request.getRes().end()
    }
}

function propfind(request)
{
    log.debug("calendar.propfind called");

    rh.setStandardHeaders(request);
    rh.setDAVHeaders(request);

    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:propfind/A:prop', {   A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });
    var childs = node.childNodes();

    var isUserRoot = true;
    var username = request.getUser().getUserName();

    // if last element === username, then get all calendar info of user, otherwise only from that specific calendar
    //var lastelement = request.getLastPathElement();

    // FIXME @mdarveau This will not work with root path other than /
    // if URL element size === 4, this is a call for the root URL of a user.
    // TODO:
    console.log("request.getUrlElementSize(): " + request.getUrlElementSize());
    if(request.getUrlElementSize() > 4)
    {
        isUserRoot = false;
    }
    // FIXME @mdarveau This will not work with root path other than /
    else if(request.getURL() === "/")
    {
        var response = xh.getXMLHead();
    
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";

        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'calendar-free-busy-set':
                    response += "<d:response><d:href>/</d:href></d:response>";
                    break;

                case 'current-user-principal':
                    response += "<d:response><d:href>/</d:href>";
                    response += "<d:propstat><d:prop><d:current-user-principal><d:href>/p/" + username + "/</d:href></d:current-user-principal></d:prop>";
                    response += "<d:status>HTTP/1.1 200 OK</d:status>";
                    response += "</d:propstat>";
                    response += "</d:response>";
                    break;

                case 'principal-collection-set':
                    response += "<d:principal-collection-set><d:href>/p/</d:href></d:principal-collection-set>";
                    break;
            }
        }

        response += "</d:multistatus>";
        request.getRes().status(207).send(response);
        return;
    }

    if(isUserRoot === true)
    {
        var nodeChecksum = xmlDoc.get('/A:propfind/A:prop/C:checksum-versions', {   A: 'DAV:',
            B: "urn:ietf:params:xml:ns:caldav",
            C: 'http://calendarserver.org/ns/',
            D: "http://apple.com/ns/ical/",
            E: "http://me.com/_namespace/"
        });

        if(nodeChecksum !== undefined)
        {
            var response = xh.getXMLHead();
            response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
            response += "<d:response><d:href>" + request.getURL() + "</d:href></d:response>";
            response += "</d:multistatus>";
            request.getRes().status(207).send(response);
        }
        else
        {
            var response = xh.getXMLHead();
            // first get the root node info
            response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
            response += getCalendarRootNodeResponse(request, childs);

            // then add info for all further known calendars of same user
            var query = { where: {owner: username}, order: [['order', 'ASC']] };

            CAL.findAndCountAll(query).then(function(result)
            {
                for (var i=0; i < result.count; ++i)
                {
                    var calendar = result.rows[i];

                    response += returnCalendar(request, calendar, childs);
                }

                response += returnOutbox(request);
                response += returnNotifications(request);

                response += "</d:multistatus>";
                request.getRes().status(207).send(response);
            });
        }
    }
    else
    {
        var response = xh.getXMLHead();
        
        // otherwise get that specific calendar information
        // FIXME @mdarveau This will not work with root path other than /
        var calendarId = request.getPathElement(3);
        if(calendarId === "notifications")
        {
//            response += returnNotifications(request);
//            res.write(response);

            response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
            response += "<d:response><d:href>" + request.getURL() + "</d:href>";
            response += "</d:response>";
            response += "</d:multistatus>";

            request.getRes().status(207).send(response);
        }
        else if(calendarId === "outbox")
        {
            response += returnOutbox(request);
            request.getRes().status(207).send(response);
        }
        else
        {
            CAL.find({ where: {pkey: calendarId} }).then(function(cal)
            {
                if(cal === null)
                {
                    log.warn('Calendar not found');
                }
                else
                {
                    // for every ICS element, return the props...
                    response += returnPropfindElements(request, cal, childs);
                        
                    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
                    response += "<d:response><d:href>" + request.getURL() + "</d:href>";

                    if(response.length > 0)
                    {
                        response += "<d:propstat>";
                        response += "<d:prop>";
                        response += response;
                        response += "</d:prop>";
                        response += "<d:status>HTTP/1.1 200 OK</d:status>";
                        response += "</d:propstat>";
                    }

                    response += "</d:response>";
                    response += "</d:multistatus>";
                }
                    
                request.getRes().status(207).send(response);
            });
        }
    }
}

function returnPropfindElements(request, calendar, childs)
{
    var response = "";

    var username = request.getUser().getUserName();

    var token = calendar.synctoken;

    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'add-member':
                response += "";
                break;

            case 'allowed-sharing-modes':
                response += "<cs:allowed-sharing-modes><cs:can-be-shared/><cs:can-be-published/></cs:allowed-sharing-modes>";
                break;

            case 'autoprovisioned':
                response += "";
                break;

            case 'bulk-requests':
                response += "";
                break;

            case 'calendar-color':
                response += "<xical:calendar-color xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.colour + "</xical:calendar-color>";
                break;

            case 'calendar-description':
                response += "";
                break;

            case 'calendar-free-busy-set':
                response += "";
                break;

            case 'calendar-order':
                response += "<xical:calendar-order xmlns:xical=\"http://apple.com/ns/ical/\">" + calendar.order + "</xical:calendar-order>";
                break;

            case 'calendar-timezone':
                var timezone = calendar.timezone;
                timezone = timezone.replace(/\r\n|\r|\n/g,'&#13;\r\n');

                response += "<cal:calendar-timezone>" + timezone + "</cal:calendar-timezone>";
                break;

            case 'current-user-privilege-set':
                response += getCurrentUserPrivilegeSet();
                break;

            case 'default-alarm-vevent-date':
                response += "";
                break;

            case 'default-alarm-vevent-datetime':
                response += "";
                break;

            case 'displayname':
                response += "<d:displayname>" + calendar.displayname + "</d:displayname>";
                break;

            case 'language-code':
                response += "";
                break;

            case 'location-code':
                response += "";
                break;

            case 'owner':
                response += "<d:owner><d:href>/p/" + username +"/</d:href></d:owner>";
                break;

            case 'pre-publish-url':
                response += "<cs:pre-publish-url><d:href>https://127.0.0.1/cal/" + username + "/" + calendar.pkey + "</d:href></cs:pre-publish-url>";
                break;

            case 'publish-url':
                response += "";
                break;

            case 'push-transports':
                response += "";
                break;

            case 'pushkey':
                response += "";
                break;

            case 'quota-available-bytes':
                response += "";
                break;

            case 'quota-used-bytes':
                response += "";
                break;

            case 'refreshrate':
                response += "";
                break;

            case 'resource-id':
                response += "";
                break;

            case 'resourcetype':
                response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>";
                break;

            case 'schedule-calendar-transp':
                response += "<cal:schedule-calendar-transp><cal:opaque/></cal:schedule-calendar-transp>";
                break;

            case 'schedule-default-calendar-URL':
                response += "";
                break;

            case 'source':
                response += "";
                break;

            case 'subscribed-strip-alarms':
                response += "";
                break;

            case 'subscribed-strip-attachments':
                response += "";
                break;

            case 'subscribed-strip-todos':
                response += "";
                break;

            case 'supported-calendar-component-set':
                response += "";
                break;

            case 'supported-calendar-component-sets':
                response += "<cal:supported-calendar-component-set><cal:comp name=\"VEVENT\"/></cal:supported-calendar-component-set>";
                break;

            case 'supported-report-set':
                response += getSupportedReportSet(false);
                break;

            case 'getctag':
                response += "<cs:getctag>http://swordlord.com/ns/sync/" + token + "</cs:getctag>";
                break;

            case 'getetag':
                // no response?
                break;

            case 'checksum-versions':
                // no response?
                break;

            case 'sync-token':
                response += "<d:sync-token>http://swordlord.com/ns/sync/" + token + "</d:sync-token>";
                break;

            case 'acl':
                response += getACL(request);
                break;

            case 'getcontenttype':
                //response += "<d:getcontenttype>text/calendar;charset=utf-8</d:getcontenttype>";
                break;

            default:
                if(name != 'text') log.warn("CAL-PF: not handled: " + name);
                break;
        }
    }

    return response;
}

function returnCalendar(request, calendar, childs)
{
    var response = "";
    var username = request.getUser().getUserName();

    response += "	<d:response>";
    response += "		<d:href>/cal/" + username + "/" + calendar.pkey + "/</d:href>";
    response += "		<d:propstat>";
    response += "			<d:prop>";

    response += returnPropfindElements(request, calendar, childs);

    response += "			</d:prop>";
    response += "			<d:status>HTTP/1.1 200 OK</d:status>";
    response += "		</d:propstat>";
    response += "	</d:response>";

    return response;
}

function getCalendarRootNodeResponse(request, childs)
{
    var response = "";

    var owner = request.getUser().getUserName();

    response += "<d:response><d:href>" + request.getURL() + "</d:href>";
    response += "<d:propstat>";
    response += "<d:prop>";

    var len = childs.length;
    for (var i = 0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'current-user-privilege-set':
                response += getCurrentUserPrivilegeSet();
                break;

            case 'owner':
                response += "<d:owner><d:href>/p/" + owner +"/</d:href></d:owner>";
                break;

            case 'resourcetype':
                response += "<d:resourcetype><d:collection/></d:resourcetype>";
                break;

            case 'supported-report-set':
                response += getSupportedReportSet(true);
                break;
        }
    }

    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";


    return response;
}

function  getSupportedReportSet(isRoot)
{
    var response = "";

    response += "<d:supported-report-set>";

    if(!isRoot)
    {
        response += "<d:supported-report><d:report><cal:calendar-multiget/></d:report></d:supported-report>";
        response += "<d:supported-report><d:report><cal:calendar-query/></d:report></d:supported-report>";
        response += "<d:supported-report><d:report><cal:free-busy-query/></d:report></d:supported-report>";
    }

    response += "<d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:expand-property/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:principal-property-search/></d:report></d:supported-report>";
    response += "<d:supported-report><d:report><d:principal-search-property-set/></d:report></d:supported-report>";
    response += "</d:supported-report-set>";

    return response;
}


function  getCurrentUserPrivilegeSet()
{
    var response = "";

    response += "<d:current-user-privilege-set>";
    response += "<d:privilege xmlns:d=\"DAV:\"><cal:read-free-busy/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-acl/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-content/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:write-properties/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:bind/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unbind/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:unlock/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-acl/></d:privilege>";
    response += "<d:privilege xmlns:d=\"DAV:\"><d:read-current-user-privilege-set/></d:privilege>";
    response += "</d:current-user-privilege-set>";

    return response;
}

function getACL(request)
{
    var username = request.getUser().getUserName();
    var response = "";

    response += "<d:acl>";
    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/" + username + "</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/" + username + "</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/" + username + "/calendar-proxy-write/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/" + username + "/calendar-proxy-write/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:write/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/" + username + "/calendar-proxy-read/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:read/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:authenticated/></d:principal>";
    response += "        <d:grant><d:privilege><cal:read-free-busy/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    response += "    <d:ace>";
    response += "        <d:principal><d:href>/p/system/admins/</d:href></d:principal>";
    response += "        <d:grant><d:privilege><d:all/></d:privilege></d:grant>";
    response += "        <d:protected/>";
    response += "    </d:ace>";

    return response;
}

function makeCalendar(request)
{
    log.debug("calendar.makeCalendar called");

    rh.setStandardHeaders(request);

    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/B:mkcalendar/A:set/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });

    var childs = node.childNodes();

    var timezone,
    order,
    free_busy_set,
    supported_cal_component,
    colour,
    displayname;

    var len = childs.length;
    if(len > 0)
    {
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'calendar-color':
                    colour = child.text();
                    break;

                case 'calendar-free-busy-set':
                    free_busy_set = "YES";
                    break;

                case 'displayname':
                    displayname = child.text();
                    break;

                case 'calendar-order':
                    order = child.text();
                    break;

                case 'supported-calendar-component-set':
                    supported_cal_component = "VEVENT";
                    break;

                case 'calendar-timezone':
                    timezone = child.text();
                    break;

                default:
                    if(name != 'text') log.warn("CAL-MK: not handled: " + name);
                    break;
            }
        }

        if(colour === undefined || colour.length === 0) { colour = "#0E61B9FF"; }

        //node.childNodes()[1].attr("symbolic-color").value()
        //node.childNodes()[1].text()
        var filename = request.getLastPathElement(true);

        var defaults = {
            owner: request.getUser().getUserName(),
            timezone: timezone,
            order: order,
            free_busy_set: free_busy_set,
            supported_cal_component: supported_cal_component,
            colour: colour,
            displayname: displayname
        };

        console.log("CAL.findOrCreate with " + JSON.stringify({ where: {pkey: filename}, defaults: defaults }, null, '  '));
        
        CAL.findOrCreate({ where: {pkey: filename}, defaults: defaults }).spread(function(cal, created)
            {
                if(created)
                {
                    log.debug('Created CAL: ' + JSON.stringify(cal, null, 4));
                }
                else
                {
                    log.debug('Loaded CAL: ' + JSON.stringify(cal, null, 4));
                }

                cal.save().then(function()
                {
                    log.warn('cal saved');
                    
                    request.getRes().sendStatus(201);
                });
            });
    }
    else
    {
        res.sendStatus(500);
    }
}

function options(request)
{
    log.debug("principal.options called");

    rh.setStandardHeaders(request);
    rh.setDAVHeaders(request);

    request.getRes().sendStatus(200);
}

function report(request)
{
    log.debug("calendar.report called");

    rh.setStandardHeaders(request);

    var xmlDoc = request.getXml();

    var rootNode = xmlDoc.root();

    var name = rootNode.name();
    switch(name)
    {
        case 'sync-collection':
            handleReportSyncCollection(request);
            break;

        case 'calendar-multiget':
            handleReportCalendarMultiget(request);
            break;

        case 'calendar-query':
            handleReportCalendarQuery(request);
            break;

        default:
            if(name != 'text') log.warn("P-R: not handled: " + name);
            request.getRes().sendStatus(500);
            break;
    }
}

function handleReportCalendarQuery(request)
{
    // FIXME @mdarveau This will not work with root path other than /
    var calendarId = request.getPathElement(3);

    CAL.find({ where: {pkey: calendarId} } ).then(function(cal)
    {
        ICS.findAndCountAll(
                { where: {calendarId: calendarId}}
            ).then(function(result)
            {
                var xmlDoc = request.getXml();

                var nodeProp = xmlDoc.get('/B:calendar-query/A:prop', {
                    A: 'DAV:',
                    B: "urn:ietf:params:xml:ns:caldav",
                    C: 'http://calendarserver.org/ns/',
                    D: "http://apple.com/ns/ical/",
                    E: "http://me.com/_namespace/"
                });

                var nodeFilter = xmlDoc.get('/B:filter', {
                    A: 'DAV:',
                    B: "urn:ietf:params:xml:ns:caldav",
                    C: 'http://calendarserver.org/ns/',
                    D: "http://apple.com/ns/ical/",
                    E: "http://me.com/_namespace/"
                });

                var response = xh.getXMLHead();
                response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n";

                var nodeProps = nodeProp.childNodes();
                var len = nodeProps.length;

                for (var j=0; j < result.count; ++j)
                {
                    var ics = result.rows[j];

                    response += "<d:response><d:href>" + request.getURL() + ics.pkey + ".ics</d:href>";
                    response += "<d:propstat>";
                    response += "<d:prop>";

                    var date = Date.parse(ics.updatedAt);

                    for (var i=0; i < len; ++i)
                    {
                        var child = nodeProps[i];
                        var name = child.name();
                        switch(name)
                        {
                            case 'getetag':
                                response += "<d:getetag>\"" + Number(date) + "\"</d:getetag>";
                                break;

                            case 'getcontenttype':
                                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + cal.supported_cal_component + "</d:getcontenttype>";
                                break;

                            case 'calendar-data':
                                response += "<c:calendar-data>" + ics.content + "</c:calendar-data>";
                                break;

                            default:
                                if(name != 'text') log.warn("P-R: not handled: " + name);
                                break;
                        }
                    }

                    response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>";
                    response += "</d:response>";
                }

                response += "</d:multistatus>";
                request.getRes().send(response);
            });
    });

    /*
    *
    * <?xml version="1.0" encoding="UTF-8"?>
     <B:calendar-query xmlns:B="urn:ietf:params:xml:ns:caldav">
     <A:prop xmlns:A="DAV:">
        <A:getetag/>
        <A:getcontenttype/>
     </A:prop>
     <B:filter>
        <B:comp-filter name="VCALENDAR">
           <B:comp-filter name="VEVENT">
              <B:time-range start="20140107T000000Z"/>
           </B:comp-filter>
        </B:comp-filter>
     </B:filter>
     </B:calendar-query>
    * */
}

function handleReportSyncCollection(request)
{
    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:sync-collection', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });

    if(node != undefined)
    {
        // FIXME @mdarveau This will not work with root path other than /
        var calendarId = request.getPathElement(3);

        CAL.find({ where: {pkey: calendarId} } ).then(function(cal)
        {
            ICS.findAndCountAll(
                { where: {calendarId: calendarId}}
//                { where: {updatedAt: { gte: cal.updatedAt}}}
            ).then(function(result)
            {
                var response = xh.getXMLHead();

                response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n";
                
                for (var j=0; j < result.count; ++j)
                {
                    var ics = result.rows[j];

                    var childs = node.childNodes();

                    var len = childs.length;
                    for (var i=0; i < len; ++i)
                    {
                        var child = childs[i];
                        var name = child.name();
                        switch(name)
                        {
                            case 'sync-token':
                                break;

                            case 'prop':
                                response += handleReportCalendarProp(request, child, cal, ics);
                                break;

                            default:
                                if(name != 'text') log.warn("P-R: not handled: " + name);
                                break;
                        }
                    }

                }

                response += "<d:sync-token>http://swordlord.org/ns/sync/" + cal.synctoken + "</d:sync-token>";
                response += "</d:multistatus>";

                request.getRes().send(response)
            });
        });
    } else {
        log.error("sync-collection not found in request");
        request.getRes().sendStatus(500);
    }
    
}

function handleReportCalendarProp(request, node, cal, ics)
{
    var response = "";

    response += "<d:response>";
    response += "<d:href>" + request.getURL() + ics.pkey + ".ics</d:href>";
    response += "<d:propstat><d:prop>";

    var childs = node.childNodes();

    var date = Date.parse(ics.updatedAt);

    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'getetag':
                response += "<d:getetag>\"" + Number(date) + "\"</d:getetag>";
                break;

            case 'getcontenttype':
                response += "<d:getcontenttype>text/calendar; charset=utf-8; component=" + cal.supported_cal_component + "</d:getcontenttype>";
                break;

            default:
                if(name != 'text') log.warn("P-R: not handled: " + name);
                break;
        }
    }

    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";

    return response;
}

function handleReportCalendarMultiget(request)
{
    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/B:calendar-multiget', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });

    if(node != undefined)
    {
        var childs = node.childNodes();

        var arrHrefs = [];

        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'prop': // TODO: theoretically we should first get the parameters ordered by the client, lets do so later :)
                    break;

                case 'href':
                    arrHrefs.push(parseHrefToIcsId(child.text()));
                    break;

                default:
                    if(name != 'text') log.warn("P-R: not handled: " + name);
                    break;
            }
        }

        handleReportHrefs(request, arrHrefs);
    } else {
        log.error("calendar-multiget not found in request");
        request.getRes().sendStatus(500);
    }
}

function parseHrefToIcsId(href)
{
    var e = href.split("/");
    var id = e[e.length - 1];

    return id.substr(0, id.length - 4);
}

function handleReportHrefs(request, arrIcsIds)
{
    ICS.findAndCountAll( { where: {pkey: arrIcsIds}}).then(function(result)
    {
        var response = xh.getXMLHead();
        response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n";
        
        for (var i=0; i < result.count; ++i)
        {
            var ics = result.rows[i];

            var date = Date.parse(ics.updatedAt);

            response += "<d:response>";
            response += "<d:href>" + request.getURL() + ics.pkey + ".ics</d:href>";
            response += "<d:propstat><d:prop>";
            response += "<cal:calendar-data>" + ics.content + "</cal:calendar-data>";
            response += "<d:getetag>\"" + Number(date) + "\"</d:getetag>";
            response += "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>";
            response += "<d:propstat><d:prop>";
            response += "<cs:created-by/><cs:updated-by/>";
            response += "</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>";
            response += "</d:response>";
        }

        response += "</d:multistatus>\r\n";
        request.getRes().send(response);
    });
}

function proppatch(request)
{
    log.debug("calendar.proppatch called");

    rh.setStandardHeaders(request);

    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:propertyupdate/A:set/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });
    var childs = node.childNodes();

    var isRoot = true;

    // if URL element size === 4, this is a call for the root URL of a user.
    // TODO:
    // FIXME @mdarveau This will not work with root path other than /
    if(request.getUrlElementSize() > 4)
    {
        var lastPathElement = request.getFilenameFromPath(false);
        if(request.stringEndsWith(lastPathElement, '.ics'))
        {
            isRoot = false;
        }
    }

    var response = xh.getXMLHead();

    if(isRoot)
    {
        var calendarId = request.getLastPathElement(false);
        CAL.find({ where: {pkey: calendarId} }).then(function(cal)
        {
            response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\" xmlns:ical=\"http://apple.com/ns/ical/\">\r\n";
            response += "	<d:response>\r\n";
            response += "		<d:href>" + request.getURL() + "</d:href>\r\n";
            response += "		<d:propstat>\r\n";
            response += "			<d:prop>\r\n";

            if(cal === null)
            {
                log.warn('Calendar not found');
                
                var len = childs.length;
                for (var i=0; i < len; ++i)
                {
                    var child = childs[i];
                    var name = child.name();
                    switch(name)
                    {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            log.info("proppatch default-alarm-vevent-date not handled yet");
                            break;

                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            log.info("proppatch default-alarm-vevent-datetime not handled yet");
                            break;

                        default:
                            if(name != 'text') log.warn("CAL-PP: not handled: " + name);
                            break;
                    }
                }
            }
            else
            {
                var len = childs.length;
                for (var i=0; i < len; ++i)
                {
                    var child = childs[i];
                    var name = child.name();
                    switch(name)
                    {
                        case 'default-alarm-vevent-date':
                            response += "<cal:default-alarm-vevent-date/>";
                            log.info("proppatch default-alarm-vevent-date not handled yet");
                            break;

                        case 'default-alarm-vevent-datetime':
                            response += "<cal:default-alarm-vevent-datetime/>";
                            log.info("proppatch default-alarm-vevent-datetime not handled yet");
                            break;

                        case 'displayname':
                            response += "<cal:displayname/>";
                            cal.displayname = child.text();
                            break;

                        case 'calendar-timezone':
                            response += "<cal:calendar-timezone/>";
                            cal.timezone = child.text();
                            break;

                        case 'calendar-color':
                            response += "<ical:calendar-color/>";
                            cal.colour = child.text();
                            break;

                        case 'calendar-order':
                            response += "<ical:calendar-order/>";
                            cal.order = child.text();
                            break;

                        default:
                            if(name != 'text') log.warn("CAL-PP: not handled: " + name);
                            break;
                    }
                }

                cal.save().then(function()
                {
                    log.warn('cal saved');
                });
            }

            response += "			</d:prop>\r\n";
            response += "			<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n";
            response += "		</d:propstat>\r\n";
            response += "	</d:response>\r\n";
            response += "</d:multistatus>\r\n";
            
            request.getRes().send(response);
        });
    } else {
        request.getRes().send(response);
    }
}

function returnOutbox(request)
{
    var response = "";

    var username = request.getUser().getUserName();

    response += "<d:response>";
    response += "   <d:href>/cal/" + username + "/outbox/</d:href>";
    response += "    <d:propstat>";
    response += "        <d:prop>";
    response += "            <d:current-user-privilege-set>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read-acl/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:read-current-user-privilege-set/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:schedule-post-vevent xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>";
    response += "               </d:privilege>";
    response += "               <d:privilege xmlns:d=\"DAV:\">";
    response += "                   <d:schedule-query-freebusy xmlns:d=\"urn:ietf:params:xml:ns:caldav\"/>";
    response += "               </d:privilege>";
    response += "           </d:current-user-privilege-set>";
    response += "           <d:owner>";
    response += "               <d:href>/p/" + username + "/</d:href>";
    response += "           </d:owner>";
    response += "           <d:resourcetype>";
    response += "              <d:collection/>";
    response += "               <cal:schedule-outbox/>";
    response += "           </d:resourcetype>";
    response += "           <d:supported-report-set>";
    response += "              <d:supported-report>";
    response += "                   <d:report>";
    response += "                       <d:expand-property/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "               <d:supported-report>";
    response += "                   <d:report>";
    response += "                       <d:principal-property-search/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "               <d:supported-report>";
    response += "                    <d:report>";
    response += "                       <d:principal-search-property-set/>";
    response += "                   </d:report>";
    response += "               </d:supported-report>";
    response += "            </d:supported-report-set>";
    response += "       </d:prop>";
    response += "       <d:status>HTTP/1.1 200 OK</d:status>";
    response += "   </d:propstat>";
    response += "</d:response>";

    return response;
}

function returnNotifications(request)
{
    var response = "";

    var username = request.getUser().getUserName();

    response += "<d:response>";
    response += "<d:href>/cal/" + username + "/notifications/</d:href>";
    response += "<d:propstat>";
    response += "    <d:prop>";
    response += "        <d:current-user-privilege-set>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:write/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-acl/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-properties/>";
    response += "          </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:write-content/>";
    response += "           </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:bind/>";
    response += "            </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:unbind/>";
    response += "            </d:privilege>";
    response += "            <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:unlock/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:read/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "                <d:read-acl/>";
    response += "           </d:privilege>";
    response += "           <d:privilege xmlns:d=\"DAV:\">";
    response += "               <d:read-current-user-privilege-set/>";
    response += "            </d:privilege>";
    response += "       </d:current-user-privilege-set>";
    response += "       <d:owner>";
    response += "           <d:href>/p/" + username + "/</d:href>";
    response += "       </d:owner>";
    response += "       <d:resourcetype>";
    response += "           <d:collection/>";
    response += "           <cs:notification/>";
    response += "       </d:resourcetype>";
    response += "       <d:supported-report-set>";
    response += "           <d:supported-report>";
    response += "               <d:report>";
    response += "                   <d:expand-property/>";
    response += "               </d:report>";
    response += "           </d:supported-report>";
    response += "           <d:supported-report>";
    response += "               <d:report>";
    response += "                   <d:principal-property-search/>";
    response += "               </d:report>";
    response += "           </d:supported-report>";
    response += "          <d:supported-report>";
    response += "               <d:report>";
    response += "                  <d:principal-search-property-set/>";
    response += "              </d:report>";
    response += "           </d:supported-report>";
    response += "       </d:supported-report-set>";
    response += "   </d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";

    return response;
}