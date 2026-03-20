const { Router } = require('express');
const selcController = require('../controller/selcController');

const router = Router();

router.post('/api/selc/sync', selcController.sync);

module.exports = router;
