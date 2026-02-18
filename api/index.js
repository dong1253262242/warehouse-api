require('dotenv').config();

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  'Content-Type': 'application/json'
};

// 发送响应
function sendResponse(res, statusCode, data) {
  res.writeHead(statusCode, corsHeaders);
  res.end(JSON.stringify(data));
}

// 解析请求体
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// 内存存储（临时）
let publicDataStore = {
  goodsList: [],
  typeData: {
    mainTypes: ['原材料','半成品','成品','包装材料','辅料','其他'],
    subTypes: {原材料:[],半成品:[],成品:[],包装材料:[],辅料:[],其他:[]}
  }
};

// 主处理函数
module.exports = async (req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    sendResponse(res, 200, { success: true });
    return;
  }

  const url = req.url;
  const method = req.method;

  try {
    // 健康检查接口
    if (url === '/api/health' && method === 'GET') {
      sendResponse(res, 200, { 
        success: true,
        message: '服务正常运行',
        time: new Date().toISOString()
      });
      return;
    }

    // 测试接口
    if (url === '/api/test' && method === 'GET') {
      sendResponse(res, 200, { 
        success: true,
        message: 'API 测试成功',
        url: url,
        method: method,
        time: new Date().toISOString()
      });
      return;
    }

    // 解析请求体
    const body = await parseBody(req);

    // 公共数据模式：获取数据
    if (url === '/api/data' && method === 'GET') {
      sendResponse(res, 200, { 
        success: true,
        data: publicDataStore,
        lastSync: new Date()
      });
      return;
    }

    // 公共数据模式：同步数据
    if (url === '/api/sync' && method === 'POST') {
      const { data } = body;
      if (!data) {
        sendResponse(res, 400, { error: '数据不能为空' });
        return;
      }

      publicDataStore = data;

      sendResponse(res, 200, { 
        success: true,
        message: '同步成功',
        syncTime: new Date()
      });
      return;
    }

    // 登录（模拟）
    if (url === '/api/login' && method === 'POST') {
      const { username, password } = body;
      
      if (!username || !password) {
        sendResponse(res, 400, { error: '账号和密码不能为空' });
        return;
      }

      sendResponse(res, 200, { 
        success: true, 
        token: 'mock-token-123',
        data: publicDataStore,
        message: '登录成功'
      });
      return;
    }

    // 注册（模拟）
    if (url === '/api/register' && method === 'POST') {
      const { username, password } = body;
      
      if (!username || !password) {
        sendResponse(res, 400, { error: '账号和密码不能为空' });
        return;
      }

      sendResponse(res, 201, { 
        success: true, 
        token: 'mock-token-123',
        message: '注册成功'
      });
      return;
    }

    // 404
    sendResponse(res, 404, { error: '接口不存在', url, method });

  } catch (error) {
    console.error('Error:', error);
    sendResponse(res, 500, { 
      error: '服务器错误', 
      message: error.message
    });
  }
};
