const verifyApiToken = (req, res, next) => {
    try{
        const apiToken = req.headers['api_token']
        if(typeof apiToken !== 'undefined'){
            if(process.env.API_TOKEN === '2b0df3714e6af79a43b77c63f2c9c7a31541a934'){
                res.status(200)
                next()
            } else{
                return res.status(403).send({
                    success: false,
                    message: 'Api Token does not match',
                    status: 403
                  })
            }
        } else{
            return res.status(403).send({
                success: false,
                message: 'Api Token is missing',
                status: 403
              })
        }
    }catch(error){
       return res.status(500).send(error)
    }
}

module.exports = {
    verifyApiToken
  }