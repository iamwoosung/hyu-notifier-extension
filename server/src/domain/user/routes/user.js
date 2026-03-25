const { Router } = require('express');
const userController = require('../controller/userController');

const router = Router();

router.get('/api/me', userController.getMe);
router.get('/api/user/settings', userController.getUserSettings);
router.patch('/api/user/settings', userController.updateUserSettings);
router.post('/api/logout', userController.logout);

module.exports = router;
