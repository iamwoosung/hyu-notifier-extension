const { Router } = require('express');
const oauthRoutes = require('../../domain/oauth/routes/oauth');
const userRoutes = require('../../domain/user/routes/user');
const lmsRoutes = require('../../domain/lms/routes/lms');
const selcRoutes = require('../../domain/selc/routes/selc');

const router = Router();

router.use(oauthRoutes);
router.use(userRoutes);
router.use(lmsRoutes);
router.use(selcRoutes);

module.exports = router;
