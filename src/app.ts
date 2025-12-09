import Express from 'express';
import Cors from 'cors'
import Morgan from 'morgan'

import { RegisterRoutes } from './routes'
import SwaggerUi from 'swagger-ui-express'
import SwaggerDoc from './swagger.json'
import { ValidateError } from 'tsoa';
import { ErrorWithStatus } from './error';

const app = Express();
app.use(Morgan('dev'))
app.use(Cors())
app.use(
    Express.urlencoded({
        extended: true,
    })
);
app.use(Express.json());

app.get('/', async (req, res) => {    
    res.send('This is the chat server! <a href="./docs">API docs</a>');
});

app.use('/docs',
    SwaggerUi.serve,
    SwaggerUi.setup(SwaggerDoc, { swaggerOptions: { persistAuthorization: true } })
)

RegisterRoutes(app)

// error handling
app.use(((err, req, res, next) => {
    if (err instanceof ValidateError) {
        res.status(err.status).json({
            error: 'validation failed',
            fields: err.fields
        })
    } else if (err.status) {
        res.status(err.status).json({
            error: err.message
        })
    } else {
        console.log(err)
        res.status(500).json({ error: "something wrong" })
    }
}) as Express.ErrorRequestHandler)

app.use((req, res) => {
    res.status(404).send({
        error: "not found",
    })
})

const port = 3000;

app.listen(port, (err) => {
    if (err) {
        console.log(err.message)
        return
    }
    console.log(`chat server is listening on ${port} !!!`);
});
