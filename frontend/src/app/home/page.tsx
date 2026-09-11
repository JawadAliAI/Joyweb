/**
 * The customer dashboard, reachable at /home as well as /.
 *
 * On the admin host the web server answers a bare "/" with a redirect to the
 * admin sign-in page, so a link to "/" can never show an administrator the
 * customer app there. Every in-app link to the dashboard uses /home instead,
 * which works the same on every host.
 */
export { default } from '../page';
