require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// MongoDB 连接
const uri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// 是否启用公共数据模式（无需登录，所有用户共享数据）
const PUBLIC_DATA_MODE = true;

let client = null;
let db = null;
let dbConnected = false;

async function connectDB() {
  if (!client) {
    if (!uri) {
      throw new Error('MONGODB_URI 环境变量未设置');
    }
    try {
      client = new MongoClient(uri);
      await client.connect();
      db = client.db('warehouse');
      dbConnected = true;
    } catch (err) {
      console.error('MongoDB 连接失败:', err.message);
      throw new Error('数据库连接失败: ' + err.message);
    }
  }
  return db;
}

// CORS 头
const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  'Content-Type': 'application/json'
};

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

// 验证 Token
function verifyToken(authHeader) {
  if (!authHeader) return null;
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// 获取或创建公共数据
async function getPublicData() {
  const publicData = db.collection('publicData');
  let data = await publicData.findOne({ _id: 'shared' });
  if (!data) {
    await publicData.insertOne({
      _id: 'shared',
      data: {
        goodsList: [],
        typeData: {
          mainTypes: ['原材料','半成品','成品','包装材料','辅料','其他'],
          subTypes: {原材料:[],半成品:[],成品:[],包装材料:[],辅料:[],其他:[]}
        }
      },
      lastSync: new Date()
    });
    data = await publicData.findOne({ _id: 'shared' });
  }
  return data;
}

// 发送响应
function sendResponse(res, statusCode, data) {
  res.writeHead(statusCode, corsHeaders);
  res.end(JSON.stringify(data));
}

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
    // 健康检查接口 - 不需要数据库
    if (url === '/api/health' && method === 'GET') {
      sendResponse(res, 200, { 
        success: true,
        message: '服务正常运行',
        time: new Date().toISOString(),
        mongodbConfigured: !!uri,
        mongodbConnected: dbConnected
      });
      return;
    }

    // 测试接口 - 不需要数据库
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

    // 检查 MongoDB 是否配置
    if (!uri) {
      sendResponse(res, 500, { 
        error: '服务器配置错误',
        message: 'MONGODB_URI 环境变量未设置，请在 Vercel 设置中添加数据库连接字符串'
      });
      return;
    }

    await connectDB();
    const users = db.collection('users');
    const publicData = db.collection('publicData');

    // 解析请求体
    const body = await parseBody(req);

    // 公共数据模式：获取数据（无需认证）
    if (PUBLIC_DATA_MODE && url === '/api/data' && method === 'GET') {
      const data = await getPublicData();
      sendResponse(res, 200, { 
        success: true,
        data: data.data,
        lastSync: data.lastSync
      });
      return;
    }

    // 公共数据模式：同步数据（无需认证）
    if (PUBLIC_DATA_MODE && url === '/api/sync' && method === 'POST') {
      const { data } = body;
      if (!data) {
        sendResponse(res, 400, { error: '数据不能为空' });
        return;
      }

      await publicData.updateOne(
        { _id: 'shared' },
        { 
          $set: { 
            data,
            lastSync: new Date()
          } 
        },
        { upsert: true }
      );

      sendResponse(res, 200, { 
        success: true,
        message: '同步成功',
        syncTime: new Date()
      });
      return;
    }

    // 注册
    if (url === '/api/register' && method === 'POST') {
      const { username, password } = body;
      
      if (!username || !password) {
        sendResponse(res, 400, { error: '账号和密码不能为空' });
        return;
      }

      const existing = await users.findOne({ username });
      if (existing) {
        sendResponse(res, 409, { error: '账号已存在' });
        return;
      }

      const hashed = await bcrypt.hash(password, 10);
      const result = await users.insertOne({
        username,
        password: hashed,
        data: {
          goodsList: [],
          typeList: [],
          stockRecords: []
        },
        createdAt: new Date(),
        lastSync: new Date()
      });

      const token = jwt.sign({ userId: result.insertedId.toString() }, JWT_SECRET);
      sendResponse(res, 201, { 
        success: true, 
        token,
        message: '注册成功'
      });
      return;
    }

    // 登录
    if (url === '/api/login' && method === 'POST') {
      const { username, password } = body;
      
      if (!username || !password) {
        sendResponse(res, 400, { error: '账号和密码不能为空' });
        return;
      }

      const user = await users.findOne({ username });
      if (!user || !await bcrypt.compare(password, user.password)) {
        sendResponse(res, 401, { error: '账号或密码错误' });
        return;
      }

      const token = jwt.sign({ userId: user._id.toString() }, JWT_SECRET);
      sendResponse(res, 200, { 
        success: true, 
        token,
        data: user.data,
        message: '登录成功'
      });
      return;
    }

    // 获取数据（需要认证）
    if (url === '/api/data' && method === 'GET') {
      const decoded = verifyToken(req.headers.authorization);
      if (!decoded) {
        sendResponse(res, 401, { error: '未登录或登录已过期' });
        return;
      }

      const user = await users.findOne({ _id: new ObjectId(decoded.userId) });
      if (!user) {
        sendResponse(res, 404, { error: '用户不存在' });
        return;
      }

      sendResponse(res, 200, { 
        success: true,
        data: user.data,
        lastSync: user.lastSync
      });
      return;
    }

    // 同步数据（需要认证）
    if (url === '/api/sync' && method === 'POST') {
      const decoded = verifyToken(req.headers.authorization);
      if (!decoded) {
        sendResponse(res, 401, { error: '未登录或登录已过期' });
        return;
      }

      const { data } = body;
      if (!data) {
        sendResponse(res, 400, { error: '数据不能为空' });
        return;
      }

      await users.updateOne(
        { _id: new ObjectId(decoded.userId) },
        { 
          $set: { 
            data,
            lastSync: new Date()
          } 
        }
      );

      sendResponse(res, 200, { 
        success: true,
        message: '同步成功',
        syncTime: new Date()
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
