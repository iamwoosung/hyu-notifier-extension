const { Router } = require('express');
const subjectController = require('../controller/subjectController');

const router = Router();

router.get('/api/subjects', subjectController.getSubjects);

module.exports = router;
