# Router API Analysis - Huawei EG8147X6

This document details the API endpoints discovered from analyzing the HAR file for monitoring internet connection status on the Huawei EG8147X6 router.

## Summary

The router requires authentication and exposes WAN (internet) connection status through JavaScript-based API endpoints. The key data includes connection status, IP addresses, DNS servers, and traffic statistics.

## Authentication Flow

### 1. Get CSRF Token
**Endpoint**: `POST http://192.168.0.1/asp/GetRandCount.asp`

**Headers**:
```
Accept: */*
Content-Type: application/x-www-form-urlencoded
Content-Length: 0
```

**Response**: Returns a CSRF token (hexadecimal string)

**Example Response**:
```
6445f1f3a1f2ba0c04948ce8b1a19ff5
```

### 2. Login
**Endpoint**: `POST http://192.168.0.1/login.cgi`

**Headers**:
```
Content-Type: application/x-www-form-urlencoded
```

**Body** (Form Data):
```
UserName=Epuser
PassWord=WVZzRDI0bWM%3D  (Base64 encoded)
Language=english
x.X_HW_Token=<token_from_step_1>
```

**Note**: The password appears to be Base64 encoded before being sent.

**Response**: Returns a redirect or empty response with status 200 on success. After this, a session is established via cookies.

## WAN Status Endpoints

### 1. WAN Connection List (Primary)
**Endpoint**: `GET http://192.168.0.1/html/bbsp/common/wan_list.asp`

**Description**: Returns JavaScript code that defines WAN connection configurations and current status.

**Authentication**: Session cookie from login required

**Response Format**: JavaScript code with arrays

**Key Variables in Response**:

#### `IPWanList` Array
Contains IP-based WAN connections with the following structure:

```javascript
var IPWanList = new Array(
  new WanIP(
    domain,              // e.g., "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1"
    X_HW_VXLAN_Enable,   // "0"
    ConnectionTrigger,    // "AlwaysOn"
    MACAddress,          // "C0:BC:9A:61:92:AA"
    Status,              // "Connected" | "Connecting" | "Disconnected"
    LastConnErr,         // "ERROR_NONE" | "ERROR_NO_CARRIER"
    RemoteWanInfo,       // ""
    Name,                // "2_INTERNET_R_VID_10"
    Enable,              // "1"
    EnableLanDhcp,       // ""
    DstIPForwardingList, // ""
    ConnectionStatus,    // "Connected"
    Mode,                // "IP_Routed"
    IPMode,              // "DHCP"
    IPAddress,           // "5.154.8.114"
    SubnetMask,          // "255.255.255.128"
    Gateway,             // "5.154.8.1"
    NATEnable,           // "1"
    X_HW_NatType,        // "0"
    dnsstr,              // "78.136.107.50,84.232.73.171"
    VlanId,              // "10"
    MultiVlanID,         // "4294967295"
    Pri8021,             // "0"
    VenderClassID,       // ""
    ClientID,            // ""
    ServiceList,         // "INTERNET" | "VOIP" | "TR069" | "IPTV"
    ExServiceList,       // ""
    Tr069Flag,           // "0"
    MacId,               // "2"
    IPv4Enable,          // "1"
    IPv6Enable,          // "0"
    IPv6MultiCastVlan,   // "-1"
    PriPolicy,           // "Specified"
    DefaultPri,          // "0"
    MaxMTUSize,          // "1500"
    DHCPLeaseTime,       // "14400"
    NTPServer,           // ""
    TimeZoneInfo,        // ""
    SIPServer,           // ""
    StaticRouteInfo,     // ""
    VendorInfo,          // ""
    DHCPLeaseTimeRemaining, // "7367"
    Uptime,              // "201494"
    DNSOverrideAllowed,  // "0"
    X_HW_LowerLayers,    // hash string
    X_HW_IPoEName,       // ""
    X_HW_IPoEPassword,   // ""
    X_HW_IGMPEnable,     // ""
    X_HW_DscpToPbitTbl,  // ""
    IPv4IPAddressSecond, // ""
    IPv4SubnetMaskSecond,// ""
    IPv4IPAddressThird,  // ""
    IPv4SubnetMaskThird, // ""
    X_HW_NPTv6Enable,    // "0"
    X_HW_SpeedLimit_UP,  // "0"
    X_HW_SpeedLimit_DOWN // "0"
  ),
  null  // Array terminator
);
```

#### `PPPWanList` Array
Contains PPPoE-based WAN connections (similar structure to IPWanList).

#### `WanEthIPStats` Array
Contains traffic statistics:

```javascript
var WanEthIPStats = new Array(
  new WaninfoStats(
    domain,            // Same as WanIP domain
    BytesSent,         // "791484635"
    BytesReceived,     // "1823521274"
    PacketsSent,       // "25164933"
    PacketsReceived,   // "69697144"
    UnicastSent,       // "25098353"
    UnicastReceived,   // "69489910"
    MulticastSent,     // "66574"
    MulticastReceived, // "0"
    BroadcastSent,     // "6"
    BroadcastReceived  // "207234"
  ),
  null
);
```

### 2. WAN Connection Info (Alternative)
**Endpoint**: `GET http://192.168.0.1/html/bbsp/common/wan_list_info.asp`

**Description**: Returns JavaScript code with WAN configuration functions and default values. Less useful for real-time status, more for configuration templates.

## Key Status Fields

### Connection Status Values
- **`"Connected"`**: Internet connection is active and working
- **`"Connecting"`**: Connection attempt in progress
- **`"Disconnected"`**: No internet connection

### Error Status Values
- **`"ERROR_NONE"`**: No errors, connection is healthy
- **`"ERROR_NO_CARRIER"`**: Physical link is down (no signal from ISP)
- Other error codes may exist

### Service Types
- **`"INTERNET"`**: Primary internet connection
- **`"VOIP"`**: Voice over IP connection
- **`"TR069"`**: Remote management protocol
- **`"IPTV"`**: IPTV service connection

## Monitoring Strategy

### Simple Connection Check
1. Authenticate (get token + login)
2. Fetch `/html/bbsp/common/wan_list.asp`
3. Parse JavaScript response to extract `IPWanList` and `PPPWanList` arrays
4. Find WAN connections with `ServiceList` containing `"INTERNET"`
5. Check if `Status === "Connected"` and `LastConnErr === "ERROR_NONE"`

### Advanced Monitoring
Additionally track:
- IP address changes
- DNS server changes
- Uptime
- Traffic statistics
- Connection errors

## Implementation Notes

### Parsing JavaScript Response
The response is actual JavaScript code, not JSON. You need to:
1. Extract the variable declarations
2. Parse the `new WanIP(...)` constructor calls
3. Map constructor arguments to field names

### Session Management
- After login, the router sets cookies
- You must maintain these cookies for subsequent requests
- Session may expire after inactivity (test timeout period)
- Consider re-authenticating on 401/403 responses

### Security Considerations
- Store credentials securely (environment variables)
- Use HTTPS if available (though this router uses HTTP)
- Consider VPN or local network access only
- Don't expose credentials in logs

## Example Connection Status Check

### Healthy Internet Connection:
```javascript
new WanIP(
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANIPConnection.1",
  ...,
  "Connected",           // Status
  "ERROR_NONE",          // LastConnErr
  ...,
  "2_INTERNET_R_VID_10", // Name
  ...,
  "Connected",           // ConnectionStatus
  ...,
  "5.154.8.114",        // IPAddress (not 0.0.0.0)
  ...
)
```

### Failed Connection:
```javascript
new WanIP(
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1",
  ...,
  "Connecting",         // Status (not Connected)
  "ERROR_NO_CARRIER",   // LastConnErr (error present)
  ...,
  "3_VOIP_R_VID_30",    // Name
  ...,
  "Connecting",         // ConnectionStatus
  ...,
  "0.0.0.0",           // IPAddress (no valid IP)
  ...
)
```

## Sample Code Patterns

### Regex to Extract WAN Status
```javascript
// Extract IPWanList array
const ipWanMatch = response.match(/var IPWanList = new Array\(([\s\S]*?)\);/);

// Extract individual WanIP entries
const wanIpPattern = /new WanIP\((.*?)\)(?=,\s*(?:new WanIP|null))/g;
```

### Status Determination
```javascript
function isInternetUp(wanConnection) {
  return wanConnection.Status === "Connected" 
    && wanConnection.LastConnErr === "ERROR_NONE"
    && wanConnection.ServiceList.includes("INTERNET")
    && wanConnection.IPAddress !== "0.0.0.0";
}
```

## Router Information
- **Model**: Huawei EG8147X6
- **Firmware**: EG8147X6 COMMON
- **IP Address**: 192.168.0.1
- **Access Type**: GPON (Fiber)

## Additional Endpoints Discovered

### Menu Structure
- `POST /asp/getMenuArray.asp` - Returns menu structure and available features

### Main Page
- `GET /CustomApp/mainpage.asp` - Dashboard page with overall system status

### Device Info
- `GET /html/ssmp/deviceinfo/deviceinfo.asp` - Device information page

These may provide additional useful metrics for comprehensive monitoring.
