const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store').default || require('electron-store');

// 初始化本地存储
const store = new Store({
  defaults: {
    'teacher.password': '',
    'students': [
      { id: 1, name: '张三', score: 0 },
      { id: 2, name: '李四', score: 0 },
      { id: 3, name: '王五', score: 0 }
    ],
    'homeworks': [],
    'submissions': [],
    'rewards': [],
    'redemptions': [],
    'exams': [],        // 考试列表
    'examScores': [],    // 考试成绩
    'init.flag': false
  }
});

// 创建主窗口
function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });
  
  mainWindow.setMenu(null);
  
  if (!store.get('init.flag')) {
    store.clear();
    store.set('init.flag', true);
    store.set('students', [
      { id: 1, name: '张三', score: 0 },
      { id: 2, name: '李四', score: 0 },
      { id: 3, name: '王五', score: 0 }
    ]);
  }

  const hasPassword = store.get('teacher.password');
  const startPage = hasPassword ? 'student.html' : 'init-setup.html';
  mainWindow.loadFile(startPage);
  return mainWindow;
}

// ========== IPC 接口 ==========
// 调整学生积分（正数为加，负数为减）
ipcMain.handle('adjust-student-score', async (_, { studentId, delta, reason }) => {
  try {
    studentId = Number(studentId);
    delta = Number(delta);
    if (isNaN(studentId) || isNaN(delta) || delta === 0) {
      return { success: false, msg: '参数无效' };
    }

    let students = store.get('students', []);
    const studentIndex = students.findIndex(s => s.id === studentId);
    if (studentIndex === -1) {
      return { success: false, msg: '学生不存在' };
    }

    // 更新积分
    students[studentIndex].score = (students[studentIndex].score || 0) + delta;
    // 防止出现负数（可选，若允许负数则注释掉下面两行）
    if (students[studentIndex].score < 0) {
      students[studentIndex].score = 0;
    }
    store.set('students', students);

    // 可选：将调整记录保存到某个日志中（如操作记录），这里暂不实现

    return { 
      success: true, 
      newScore: students[studentIndex].score,
      student: students[studentIndex]
    };
  } catch (e) {
    return { success: false, msg: '调整失败：' + e.message };
  }
});
ipcMain.handle('save-init-password', async (_, pwd) => {
  try {
    const password = String(pwd).trim();
    if (!password) return { success: false, msg: '密码不能为空' };
    if (password.length < 6) return { success: false, msg: '密码长度不能少于6位' };
    store.set('teacher.password', password);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '保存失败：' + e.message };
  }
});

ipcMain.handle('verify-teacher-password', async (_, inputPwd) => {
  try {
    const realPwd = store.get('teacher.password');
    const inputPassword = String(inputPwd).trim();
    
    if (inputPassword === realPwd && realPwd) {
      BrowserWindow.getFocusedWindow().loadFile('teacher.html');
      return { success: true };
    } else {
      return { success: false, msg: '密码不正确' };
    }
  } catch (e) {
    return { success: false, msg: '验证失败：' + e.message };
  }
});

ipcMain.handle('back-to-student', async () => {
  try {
    BrowserWindow.getFocusedWindow().loadFile('student.html');
    return { success: true };
  } catch (e) {
    return { success: false, msg: '切换失败：' + e.message };
  }
});

ipcMain.handle('get-all-data', async () => {
  try {
    let students = store.get('students', []);
    let homeworks = store.get('homeworks', []);
    let submissions = store.get('submissions', []);
    let rewards = store.get('rewards', []);
    let redemptions = store.get('redemptions', []);
    let exams = store.get('exams', []);
    let examScores = store.get('examScores', []);

    students = Array.isArray(students) ? students : [];
    homeworks = Array.isArray(homeworks) ? homeworks : [];
    submissions = Array.isArray(submissions) ? submissions : [];
    rewards = Array.isArray(rewards) ? rewards : [];
    redemptions = Array.isArray(redemptions) ? redemptions : [];
    exams = Array.isArray(exams) ? exams : [];
    examScores = Array.isArray(examScores) ? examScores : [];

    return { students, homeworks, submissions, rewards, redemptions, exams, examScores };
  } catch (e) {
    return { students: [], homeworks: [], submissions: [], rewards: [], redemptions: [], exams: [], examScores: [], msg: '读取失败：' + e.message };
  }
});

ipcMain.handle('add-homework', async (_, homework) => {
  try {
    const { name, assignedStudentIds, score } = homework;
    if (!name?.trim()) return { success: false, msg: '作业名称不能为空' };
    if (!Array.isArray(assignedStudentIds) || assignedStudentIds.length === 0) {
      return { success: false, msg: '请选择至少一名学生' };
    }

    let homeworks = store.get('homeworks', []);
    homeworks.push({
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      name: name.trim(),
      createTime: new Date().toLocaleDateString(),
      assignedStudentIds: assignedStudentIds.map(id => Number(id)),
      score: Number(score) || 10
    });
    store.set('homeworks', homeworks);
    return { success: true, homeworks };
  } catch (e) {
    return { success: false, msg: '添加失败：' + e.message };
  }
});

ipcMain.handle('delete-homework', async (_, homeworkId) => {
  try {
    let homeworks = store.get('homeworks', []).filter(hw => hw.id !== homeworkId);
    let submissions = store.get('submissions', []).filter(sub => sub.homeworkId !== homeworkId);
    
    store.set('homeworks', homeworks);
    store.set('submissions', submissions);
    return { success: true, homeworks };
  } catch (e) {
    return { success: false, msg: '删除失败：' + e.message };
  }
});

ipcMain.handle('submit-homework-and-add-score', async (_, { studentId, homeworkId }) => {
  try {
    studentId = Number(studentId);
    homeworkId = String(homeworkId);

    if (!studentId || !homeworkId) return { success: false, msg: '参数错误' };

    const homeworks = store.get('homeworks', []);
    const targetHomework = homeworks.find(hw => hw.id === homeworkId);
    if (!targetHomework) return { success: false, msg: '作业不存在' };
    if (!targetHomework.assignedStudentIds.includes(studentId)) {
      return { success: false, msg: '该作业未分配给你' };
    }

    const submissions = store.get('submissions', []);
    const isSubmitted = submissions.some(sub => 
      sub.studentId === studentId && sub.homeworkId === homeworkId
    );
    if (isSubmitted) return { success: false, msg: '你已提交过该作业' };

    submissions.push({
      id: Date.now(),
      studentId,
      homeworkId,
      submitTime: new Date().toLocaleString()
    });
    store.set('submissions', submissions);

    let students = store.get('students', []);
    const targetStudent = students.find(s => s.id === studentId);
    if (targetStudent) {
      targetStudent.score = (Number(targetStudent.score) || 0) + (targetHomework.score || 10);
      store.set('students', students);
    } else {
      return { success: false, msg: '学生不存在' };
    }

    return { 
      success: true, 
      msg: `提交成功！加${targetHomework.score}分` 
    };
  } catch (e) {
    return { success: false, msg: '提交失败：' + e.message };
  }
});

ipcMain.handle('add-student', async (_, name) => {
  try {
    name = name?.trim();
    if (!name) return { success: false, msg: '学生姓名不能为空' };

    let students = store.get('students', []);
    if (students.some(s => s.name === name)) {
      return { success: false, msg: '该学生已存在' };
    }

    const maxId = students.length > 0 ? Math.max(...students.map(s => s.id)) : 0;
    students.push({
      id: maxId + 1,
      name,
      score: 0
    });
    store.set('students', students);
    return { success: true, students };
  } catch (e) {
    return { success: false, msg: '添加失败：' + e.message };
  }
});

ipcMain.handle('delete-student', async (_, studentId) => {
  try {
    let students = store.get('students', []).filter(s => s.id !== Number(studentId));
    let submissions = store.get('submissions', []).filter(sub => sub.studentId !== Number(studentId));
    let homeworks = store.get('homeworks', []).map(hw => ({
      ...hw,
      assignedStudentIds: hw.assignedStudentIds.filter(id => id !== Number(studentId))
    }));
    let redemptions = store.get('redemptions', []).filter(r => r.studentId !== Number(studentId));
    let examScores = store.get('examScores', []).filter(es => es.studentId !== Number(studentId));

    store.set('students', students);
    store.set('submissions', submissions);
    store.set('homeworks', homeworks);
    store.set('redemptions', redemptions);
    store.set('examScores', examScores);
    return { success: true, students };
  } catch (e) {
    return { success: false, msg: '删除失败：' + e.message };
  }
});

ipcMain.handle('import-students-from-txt', async () => {
  try {
    const { filePaths } = await dialog.showOpenDialog({
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      properties: ['openFile']
    });

    if (!filePaths || filePaths.length === 0) return { success: false, msg: '未选择文件' };

    const content = fs.readFileSync(filePaths[0], 'utf-8');
    const names = content.split('\n')
      .map(name => name.trim())
      .filter(name => name);

    if (names.length === 0) return { success: false, msg: '文件内容为空' };

    let students = store.get('students', []);
    let addedCount = 0;
    let existCount = 0;

    names.forEach(name => {
      if (students.some(s => s.name === name)) {
        existCount++;
        return;
      }
      const maxId = students.length > 0 ? Math.max(...students.map(s => s.id)) : 0;
      students.push({
        id: maxId + 1,
        name,
        score: 0
      });
      addedCount++;
    });

    store.set('students', students);
    return { 
      success: true, 
      msg: `导入完成！新增${addedCount}人，已存在${existCount}人`,
      students 
    };
  } catch (e) {
    return { success: false, msg: '导入失败：' + e.message };
  }
});

ipcMain.handle('reset-student-scores', async () => {
  try {
    let students = store.get('students', []).map(s => ({
      ...s,
      score: 0
    }));
    store.set('students', students);
    return { success: true, students };
  } catch (e) {
    return { success: false, msg: '重置失败：' + e.message };
  }
});

ipcMain.handle('random-select-student', async (_, count) => {
  try {
    const students = store.get('students', []);
    if (students.length === 0) {
      return { success: false, msg: '没有学生数据' };
    }
    
    const num = Math.min(Number(count) || 1, students.length);
    const shuffled = [...students].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, num);
    
    return { success: true, selectedStudents: selected };
  } catch (e) {
    return { success: false, msg: '抽取失败：' + e.message };
  }
});

ipcMain.handle('add-reward', async (_, { name, points }) => {
  try {
    if (!name?.trim()) return { success: false, msg: '奖励名称不能为空' };
    if (!points || points < 1) return { success: false, msg: '所需积分必须大于0' };

    let rewards = store.get('rewards', []);
    rewards.push({
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      name: name.trim(),
      points: Number(points)
    });
    store.set('rewards', rewards);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '添加失败：' + e.message };
  }
});

ipcMain.handle('delete-reward', async (_, rewardId) => {
  try {
    let rewards = store.get('rewards', []).filter(r => r.id !== rewardId);
    store.set('rewards', rewards);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '删除失败：' + e.message };
  }
});

ipcMain.handle('process-redemption', async (_, { redemptionId, action, note }) => {
  try {
    let redemptions = store.get('redemptions', []);
    const redemptionIndex = redemptions.findIndex(r => r.id === redemptionId);
    if (redemptionIndex === -1) return { success: false, msg: '兑换请求不存在' };

    const redemption = redemptions[redemptionIndex];
    
    if (action === 'approve') {
      redemption.status = 'approved';
      redemption.processTime = new Date().toLocaleString();
    } else if (action === 'reject') {
      redemption.status = 'rejected';
      redemption.processTime = new Date().toLocaleString();
      redemption.processorNote = note || '已驳回';
      
      let students = store.get('students', []);
      const student = students.find(s => s.id === redemption.studentId);
      if (student) {
        student.score = (student.score || 0) + redemption.pointsCost;
        store.set('students', students);
      }
    } else if (action === 'complete') {
      redemption.status = 'completed';
      redemption.processTime = new Date().toLocaleString();
    }

    store.set('redemptions', redemptions);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '处理失败：' + e.message };
  }
});

ipcMain.handle('request-redemption', async (_, { studentId, rewardId }) => {
  try {
    studentId = Number(studentId);
    
    const students = store.get('students', []);
    const student = students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };

    const rewards = store.get('rewards', []);
    const reward = rewards.find(r => r.id === rewardId);
    if (!reward) return { success: false, msg: '奖励不存在' };

    if ((student.score || 0) < reward.points) {
      return { success: false, msg: '积分不足' };
    }

    student.score = (student.score || 0) - reward.points;
    store.set('students', students);

    let redemptions = store.get('redemptions', []);
    redemptions.push({
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      studentId,
      rewardId,
      pointsCost: reward.points,
      status: 'pending',
      requestTime: new Date().toLocaleString()
    });
    store.set('redemptions', redemptions);

    return { success: true, msg: '兑换请求已提交，等待老师审批' };
  } catch (e) {
    return { success: false, msg: '请求失败：' + e.message };
  }
});

// ========== 考试相关接口 ==========

ipcMain.handle('create-exam', async (_, examData) => {
  try {
    const { name, description, duration, totalScore } = examData;
    if (!name?.trim()) return { success: false, msg: '考试名称不能为空' };
    if (!duration || duration < 1) return { success: false, msg: '考试时长必须大于0' };

    let exams = store.get('exams', []);
    const newExam = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      name: name.trim(),
      description: description || '',
      duration: Number(duration),
      totalScore: Number(totalScore) || 100,
      status: 'pending',
      createTime: new Date().toLocaleString(),
      startTime: null,
      endTime: null
    };

    exams.push(newExam);
    store.set('exams', exams);
    return { success: true, exam: newExam };
  } catch (e) {
    return { success: false, msg: '创建失败：' + e.message };
  }
});

ipcMain.handle('start-exam', async (_, examId) => {
  try {
    let exams = store.get('exams', []);
    const examIndex = exams.findIndex(e => e.id === examId);
    if (examIndex === -1) return { success: false, msg: '考试不存在' };

    exams[examIndex].status = 'ongoing';
    exams[examIndex].startTime = new Date().toLocaleString();
    store.set('exams', exams);

    return { success: true, exam: exams[examIndex] };
  } catch (e) {
    return { success: false, msg: '开始考试失败：' + e.message };
  }
});

ipcMain.handle('end-exam', async (_, examId) => {
  try {
    let exams = store.get('exams', []);
    const examIndex = exams.findIndex(e => e.id === examId);
    if (examIndex === -1) return { success: false, msg: '考试不存在' };

    exams[examIndex].status = 'grading';
    exams[examIndex].endTime = new Date().toLocaleString();
    store.set('exams', exams);

    return { success: true, exam: exams[examIndex] };
  } catch (e) {
    return { success: false, msg: '结束考试失败：' + e.message };
  }
});

ipcMain.handle('complete-exam', async (_, examId) => {
  try {
    let exams = store.get('exams', []);
    const examIndex = exams.findIndex(e => e.id === examId);
    if (examIndex === -1) return { success: false, msg: '考试不存在' };

    exams[examIndex].status = 'ended';
    store.set('exams', exams);

    return { success: true, exam: exams[examIndex] };
  } catch (e) {
    return { success: false, msg: '完成考试失败：' + e.message };
  }
});

ipcMain.handle('delete-exam', async (_, examId) => {
  try {
    let exams = store.get('exams', []).filter(e => e.id !== examId);
    let examScores = store.get('examScores', []).filter(es => es.examId !== examId);
    
    store.set('exams', exams);
    store.set('examScores', examScores);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '删除失败：' + e.message };
  }
});

ipcMain.handle('enter-exam-score', async (_, { examId, studentId, score, comment }) => {
  try {
    studentId = Number(studentId);
    score = Number(score);
    
    const exams = store.get('exams', []);
    const exam = exams.find(e => e.id === examId);
    if (!exam) return { success: false, msg: '考试不存在' };

    const students = store.get('students', []);
    const student = students.find(s => s.id === studentId);
    if (!student) return { success: false, msg: '学生不存在' };

    let examScores = store.get('examScores', []);
    const existingIndex = examScores.findIndex(es => es.examId === examId && es.studentId === studentId);
    
    if (existingIndex !== -1) {
      examScores[existingIndex].score = score;
      examScores[existingIndex].comment = comment || '';
      examScores[existingIndex].updateTime = new Date().toLocaleString();
    } else {
      examScores.push({
        id: Date.now() + Math.random().toString(36).substr(2, 4),
        examId,
        studentId,
        studentName: student.name,
        score,
        comment: comment || '',
        enterTime: new Date().toLocaleString()
      });
    }
    
    store.set('examScores', examScores);
    return { success: true };
  } catch (e) {
    return { success: false, msg: '录入失败：' + e.message };
  }
});

ipcMain.handle('get-exam-scores', async (_, examId) => {
  try {
    const examScores = store.get('examScores', []).filter(es => es.examId === examId);
    return { success: true, scores: examScores };
  } catch (e) {
    return { success: false, msg: '获取失败：' + e.message };
  }
});

// ========== 平均分计算接口 ==========

ipcMain.handle('calculate-student-exam-average', async (_, studentId) => {
  try {
    studentId = Number(studentId);
    const examScores = store.get('examScores', []);
    const studentScores = examScores.filter(es => es.studentId === studentId);
    
    if (studentScores.length === 0) {
      return { success: true, average: 0, count: 0 };
    }
    
    const total = studentScores.reduce((sum, es) => sum + es.score, 0);
    const average = Math.round(total / studentScores.length * 10) / 10;
    
    return { 
      success: true, 
      average: average,
      count: studentScores.length,
      total: total
    };
  } catch (e) {
    return { success: false, msg: '计算失败：' + e.message };
  }
});

ipcMain.handle('calculate-class-exam-average', async () => {
  try {
    const examScores = store.get('examScores', []);
    const students = store.get('students', []);
    
    if (examScores.length === 0 || students.length === 0) {
      return { success: true, average: 0, count: 0 };
    }
    
    const studentAverages = {};
    examScores.forEach(es => {
      if (!studentAverages[es.studentId]) {
        studentAverages[es.studentId] = { total: 0, count: 0 };
      }
      studentAverages[es.studentId].total += es.score;
      studentAverages[es.studentId].count++;
    });
    
    const averages = Object.values(studentAverages).map(sa => sa.total / sa.count);
    const classAverage = averages.length > 0 
      ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10
      : 0;
    
    return { 
      success: true, 
      average: classAverage,
      studentCount: averages.length,
      totalExams: examScores.length
    };
  } catch (e) {
    return { success: false, msg: '计算失败：' + e.message };
  }
});

ipcMain.handle('get-all-students-exam-averages', async () => {
  try {
    const students = store.get('students', []);
    const examScores = store.get('examScores', []);
    
    const result = students.map(student => {
      const studentScores = examScores.filter(es => es.studentId === student.id);
      
      if (studentScores.length === 0) {
        return {
          ...student,
          examAverage: 0,
          examCount: 0
        };
      }
      
      const total = studentScores.reduce((sum, es) => sum + es.score, 0);
      const average = Math.round(total / studentScores.length * 10) / 10;
      
      return {
        ...student,
        examAverage: average,
        examCount: studentScores.length
      };
    });
    
    return { success: true, students: result };
  } catch (e) {
    return { success: false, msg: '获取失败：' + e.message };
  }
});

// 获取学生考试历史（返回120分制和100分制）
ipcMain.handle('get-student-exam-history', async (_, studentId) => {
  try {
    studentId = Number(studentId);
    const examScores = store.get('examScores', []);
    const exams = store.get('exams', []);
    
    const studentScores = examScores
      .filter(es => es.studentId === studentId)
      .map(es => {
        const exam = exams.find(e => e.id === es.examId);
        // 计算120分制成绩
        const score120 = exam ? Math.round((es.score / exam.totalScore) * 120 * 10) / 10 : 0;
        const score100 = exam ? Math.round((es.score / exam.totalScore) * 100 * 10) / 10 : 0;
        return {
          examId: es.examId,
          examName: exam ? exam.name : '未知考试',
          score: es.score,
          totalScore: exam ? exam.totalScore : 100,
          score120: score120,
          score100: score100,
          examDate: exam ? exam.startTime || exam.createTime : es.enterTime,
          comment: es.comment || ''
        };
      })
      .sort((a, b) => new Date(a.examDate) - new Date(b.examDate));
    
    return { 
      success: true, 
      history: studentScores,
      count: studentScores.length
    };
  } catch (e) {
    return { success: false, msg: '获取失败：' + e.message };
  }
});

// 获取单次考试的班级平均分（返回原始平均、100分制、120分制）
ipcMain.handle('get-exam-class-average', async (_, examId) => {
  try {
    const examScores = store.get('examScores', []);
    const exam = store.get('exams', []).find(e => e.id === examId);
    
    if (!exam) return { success: false, msg: '考试不存在' };
    
    const scores = examScores.filter(es => es.examId === examId);
    
    if (scores.length === 0) {
      return { 
        success: true, 
        average: 0,
        average100: 0,
        average120: 0,
        count: 0,
        totalScore: exam.totalScore
      };
    }
    
    const total = scores.reduce((sum, es) => sum + es.score, 0);
    const average = Math.round(total / scores.length * 10) / 10;
    const average100 = Math.round((average / exam.totalScore) * 100 * 10) / 10;
    const average120 = Math.round((average / exam.totalScore) * 120 * 10) / 10;
    
    return { 
      success: true, 
      average: average,
      average100: average100,
      average120: average120,
      count: scores.length,
      totalScore: exam.totalScore
    };
  } catch (e) {
    return { success: false, msg: '获取失败：' + e.message };
  }
});

// ========== 应用生命周期 ==========
app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
