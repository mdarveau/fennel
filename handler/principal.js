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

var cal = require("./calendar");

// Exporting.
module.exports = {
    propfind: propfind,
    proppatch: proppatch,
    report: report,
    options: options
};

function propfind(request)
{
    log.debug("principal.propfind called");

    rh.setStandardHeaders(request);
    rh.setDAVHeaders(request);

    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:propfind/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });
    var childs = node.childNodes();

    var response = xh.getXMLHead();
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">";
    response += "<d:response>";
    response += "<d:propstat>";
    response += "<d:prop>";
    
    var len = childs.length;
    for (var i=0; i < len; ++i)
    {
        var child = childs[i];
        var name = child.name();
        switch(name)
        {
            case 'checksum-versions':
                response += "";
                break;

            case 'sync-token':
                response += "<d:sync-token>http://sabredav.org/ns/sync/5</d:sync-token>";
                break;

            case 'supported-report-set':
                response += getSupportedReportSet();
                break;

            case 'principal-URL':
                response += "<d:principal-URL><d:href>/p/" + request.getUser().getUserName() + "/</d:href></d:principal-URL>\r\n";
                break;

            case 'displayname':
                response += "<d:displayname>" + request.getUser().getUserName() + "</d:displayname>";
                break;

            case 'principal-collection-set':
                response += "<d:principal-collection-set><d:href>/p/</d:href></d:principal-collection-set>";
                break;

            case 'current-user-principal':
                response += "<d:current-user-principal><d:href>/p/" + request.getUser().getUserName() + "/</d:href></d:current-user-principal>";
                break;

            case 'calendar-home-set':
                response += "<cal:calendar-home-set><d:href>/cal/" + request.getUser().getUserName() + "</d:href></cal:calendar-home-set>";
                break;

            case 'schedule-outbox-URL':
                response += "<cal:schedule-outbox-URL><d:href>/cal/" + request.getUser().getUserName() + "/outbox</d:href></cal:schedule-outbox-URL>";
                break;

            case 'calendar-user-address-set':
                response += getCalendarUserAddressSet(request);
                break;

            case 'notification-URL':
                response += "<cs:notification-URL><d:href>/cal/" + request.getUser().getUserName() + "/notifications/</d:href></cs:notification-URL>";
                break;

            case 'getcontenttype':
                response += "";
                break;

            case 'addressbook-home-set':
                response += "<card:addressbook-home-set><d:href>/card/" + request.getUser().getUserName() + "/</d:href></card:addressbook-home-set>";
                break;

            case 'directory-gateway':
                response += "";
                break;
            case 'email-address-set':
                response += "";
                break;
            case 'resource-id':
                response += "";
                break;

            // // FIXME @mdarveau It this usefull?
            // case 'resourcetype':
            //     response += "<d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>";
            //     break;
            //  
            // // FIXME @mdarveau It this usefull?
            // case 'owner':
            //     var username = request.getUser().getUserName();
            //     response += "<d:owner><d:href>/p/" + username +"/</d:href></d:owner>";
            //     break;
            
            default:
                if(name != 'text') log.warn("P-PF: not handled: " + name);
                break;
        }
    }

    
    response += "</d:prop>";
    response += "<d:status>HTTP/1.1 200 OK</d:status>";
    response += "</d:propstat>";
    response += "</d:response>";
    response += "</d:multistatus>";
    
    request.getRes().status(207).send(response);
}

function getCalendarUserAddressSet(request)
{
    var response = "";

    response += "        <cal:calendar-user-address-set>\r\n";
    response += "        	<d:href>mailto:lord test at swordlord.com</d:href>\r\n";
    response += "        	<d:href>/p/" + request.getUser().getUserName() + "/</d:href>\r\n";
    response += "        </cal:calendar-user-address-set>\r\n";

    return response;
}

function getSupportedReportSet()
{
    var response = "";
    response += "        <d:supported-report-set>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:expand-property/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:principal-property-search/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        	<d:supported-report>\r\n";
    response += "        		<d:report>\r\n";
    response += "        			<d:principal-search-property-set/>\r\n";
    response += "        		</d:report>\r\n";
    response += "        	</d:supported-report>\r\n";
    response += "        </d:supported-report-set>\r\n";

    return response;
}

function options(request)
{
    log.debug("principal.options called");

    var res = request.getRes();
    res.set("Content-Type", "text/html");
    res.set("Server", "Fennel");
    
    rh.setDAVHeaders(request);
    rh.setAllowHeader(request);

    res.sendStatus(200);
}

function report(request)
{
    log.debug("principal.report called");

    rh.setStandardHeaders(request);

    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:propfind/A:prop', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });

    // FIXME @mdarveau It looks like there is no XML root node here...
    var response = xh.getXMLHead();

    if(node != undefined)
    {
        var childs = node.childNodes();

        var len = childs.length;
        for (var i=0; i < len; ++i)
        {
            var child = childs[i];
            var name = child.name();
            switch(name)
            {
                case 'principal-search-property-set':
                    response += getPrincipalSearchPropertySet();
                    break;

                default:
                    if(name != 'text') log.warn("P-R: not handled: " + name);
                    break;
            }
        }
    }

    node = xmlDoc.get('/A:principal-search-property-set', {
        A: 'DAV:',
        B: "urn:ietf:params:xml:ns:caldav",
        C: 'http://calendarserver.org/ns/',
        D: "http://apple.com/ns/ical/",
        E: "http://me.com/_namespace/"
    });

    if(node != undefined)
    {
        var name = node.name();
        switch(name)
        {
            case 'principal-search-property-set':
                response += getPrincipalSearchPropertySet();
                break;

            default:
                if(name != 'text') log.warn("P-R: not handled: " + name);
                break;
        }
    }

    if(isReportPropertyCalendarProxyWriteFor(request))
    {
        response += getReplyPropertyCalendarProxyWriteFor(request);
    }
    
    // TODO: clean up
    request.getRes().send(response);
}


function getPrincipalSearchPropertySet()
{
    var response = "";
    response += "<d:principal-search-property-set xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n";
    response += "  <d:principal-search-property>\r\n";
    response += "    <d:prop>\r\n";
    response += "      <d:displayname/>\r\n";
    response += "    </d:prop>\r\n";
    response += "    <d:description xml:lang=\"en\">Display name</d:description>\r\n";
    response += "  </d:principal-search-property>\r\n";
//    response += "  <d:principal-search-property>\r\n";
//    response += "    <d:prop>\r\n";
//    response += "      <s:email-address/>\r\n";
//    response += "    </d:prop>\r\n";
//    response += "    <d:description xml:lang=\"en\">Email address</d:description>\r\n";
//    response += "  </d:principal-search-property>\r\n";
    response += "</d:principal-search-property-set>\r\n";

    return response;
}


function isReportPropertyCalendarProxyWriteFor(request)
{
    var xmlDoc = request.getXml();

    var node = xmlDoc.get('/A:expand-property/A:property[@name=\'calendar-proxy-write-for\']', { A: 'DAV:', C: 'http://calendarserver.org/ns/'});

    return typeof node != 'undefined';
}

function getReplyPropertyCalendarProxyWriteFor(request)
{
    var url = request.getURL();
    var response = "";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n";
    response += "<d:response>";
    response += "    <d:href>" + url + "</d:href>";
    response += "    <d:propstat>";
    response += "       <d:prop>";
    response += "           <cs:calendar-proxy-read-for/>";
    response += "           <cs:calendar-proxy-write-for/>";
    response += "       </d:prop>";
    response += "        <d:status>HTTP/1.1 200 OK</d:status>";
    response += "    </d:propstat>";
    response += "</d:response>";
    response += "</d:multistatus>\r\n";
    
    return response;
}

function proppatch(request)
{
    log.debug("principal.proppatch called");

    rh.setStandardHeaders(request);

    var url = request.getURL();

    response += "<?xml version=\"1.0\" encoding=\"utf-8\"?>";
    response += "<d:multistatus xmlns:d=\"DAV:\" xmlns:cal=\"urn:ietf:params:xml:ns:caldav\" xmlns:cs=\"http://calendarserver.org/ns/\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\r\n";
    response += "	<d:response>\r\n";
    response += "		<d:href>" + url + "</d:href>\r\n";
    response += "		<d:propstat>\r\n";
    response += "			<d:prop>\r\n";
    response += "				<cal:default-alarm-vevent-date/>\r\n";
    response += "			</d:prop>\r\n";
    response += "			<d:status>HTTP/1.1 403 Forbidden</d:status>\r\n";
    response += "		</d:propstat>\r\n";
    response += "	</d:response>\r\n";
    response += "</d:multistatus>\r\n";

    request.getRes().send(response);
}

