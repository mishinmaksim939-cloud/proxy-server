const http = require('http');
const net = require('net');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const UUID = process.env.UUID || 'd342d11e-d424-4583-b36e-524ab1f0afa4';

const server = http.createServer((req, res) => {
  if (req.url === '/' + UUID) {
    const host = req.headers.host;
    const vless = `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F#Render-Proxy`;
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(vless);
  } else {
    res.writeHead(200);
    res.end('OK');
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.once('message', (data) => {
    const buf = Buffer.from(data);
    const uuid = buf.slice(1, 17).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    
    if (uuid !== UUID) { ws.close(); return; }
    
    const optLen = buf[17];
    const cmdOffset = 18 + optLen;
    const port = buf.readUInt16BE(cmdOffset + 1);
    const addrType = buf[cmdOffset + 3];
    let addr = '', addrEnd;
    
    if (addrType === 1) {
      addr = buf.slice(cmdOffset + 4, cmdOffset + 8).join('.');
      addrEnd = cmdOffset + 8;
    } else if (addrType === 2) {
      const len = buf[cmdOffset + 4];
      addr = buf.slice(cmdOffset + 5, cmdOffset + 5 + len).toString();
      addrEnd = cmdOffset + 5 + len;
    }
    
    const payload = buf.slice(addrEnd);
    ws.send(Buffer.from([buf[0], 0]));
    
    const tcp = net.connect(port, addr, () => {
      if (payload.length) tcp.write(payload);
      tcp.on('data', d => ws.send(d));
      ws.on('message', d => tcp.write(d));
    });
    
    tcp.on('error', () => ws.close());
    ws.on('close', () => tcp.destroy());
  });
});

server.listen(PORT, () => console.log('Running on port', PORT));
