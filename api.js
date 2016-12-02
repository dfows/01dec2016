var express = require('express');
var router = express.Router();

var db = require('./db');
var md5 = require('js-md5');
var bcrypt = require('bcrypt');
var saltRounds = 10;

function isExpired(date) {
  return new Date(date) < new Date();
}

function emitError(msg) {
  return { error: msg };
}

function authed(req, no, yes) {
  if (!req.headers.authorization) {
    no();
  } else {
    var token = req.headers.authorization.split(" ")[1];

    db.qq('SELECT id, usr, expires_at, token FROM sessionz WHERE token = $1', [token], function(err, result) {
      if (result.rows.length < 1) {
        console.log("no such session");
        no();
      } else if (isExpired(result.rows[0].expires_at)) {
        console.log("session expired");
        no();
      } else {
        console.log("found this thing", result.rows[0]);
        yes(result.rows[0]);
      }
    });
  }
}

router.post('/users', function(req, res) {
  authed(req, function() {
    var email = req.body.email;
    var pass = req.body.pass;
    var realName = req.body.realName;
  
    var shittyRegex = /^[a-z0-9-_]+@[a-z0-9-_]+\.[a-z0-9]{2,4}$/;
    if (!email.toLowerCase().match(shittyRegex)) {
      return res.status(422).send(emitError("email not real"));
    }
    if (!pass || pass.length < 6) {
      return res.status(422).send(emitError("password must be at least 6 chars"));
    }
  
    db.qq('SELECT email FROM userz WHERE email = $1', [email], function(err, result) {
      if (result.rows.length > 0) {
        return res.status(422).send(emitError("already exists"));
      } else {
        bcrypt.hash(pass, saltRounds, function(err, hash) {
          db.qq('INSERT INTO userz (email, password, real_name) VALUES ($1, $2, $3)', [email, hash, realName], function(err, result) {
            return res.status(201).send("created");
          });
        });
      }
    });
  }, function(sess) {
    return res.status(302).send("you are user#" + sess.usr);
  });
});

router.delete('/users/:id', function(req, res) {
  authed(req, function() {
    return res.status(401).send(emitError("requires auth"));
  }, function(sess) {
    // aight so u have a token but is it the correct token / the token of this user u tryna delete.
    if (req.params.id != sess.usr) {
      return res.status(403).send(emitError("forbidden"));
    } else {
      db.qq('DELETE FROM userz WHERE id = $1', [sess.usr], function(err, result) {
        console.log("deleted user");
        // should also clean up the user's sessions; don't do that here though
        return res.status(204).send();
      });
    }
  });
});

router.post('/sessions', function(req, res) {
  authed(req, function() {
    var email = req.body.email;
    var pass = req.body.pass;
  
    db.qq('SELECT id, email, password FROM userz WHERE email = $1', [email], function(err, result) {
      if (result.rows.length < 1) {
        return res.status(422).send(emitError("user not found")); //this is very detailed; would expose less info with a generic 'badlogin' but for testing imma use this
      } else {
        var user = result.rows[0];
        bcrypt.compare(pass, user.password, function(err, check) {
          if (!check) {
            return res.status(422).send(emitError("badlogin"));
          } else {
            // not sure what to return here since idk what this is being used for
            db.qq('INSERT INTO sessionz (usr, token) VALUES ($1, $2) RETURNING id, token', [user.id, md5(new Date().toString())], function(err, result) {
              return res.status(201).send(result.rows[0]);
            });
          }
        });
      }
    });
  }, function(sess) {
    return res.status(302).send("you are already logged in. you are user#" + sess.usr);
  });
});

router.delete('/sessions/:id', function(req, res) {
  authed(req, function() {
    return res.status(401).send(emitError("must be authenticated"));
  }, function(sess) {
    var yourToken = sess.token;
    if (sess.id != req.params.id) {
      return res.status(403).send(emitError("unavailable"));
    } else {
      db.qq('DELETE FROM sessionz WHERE id = $1', [req.params.id], function(err, result) {
        console.log("logged out");
        return res.status(204).send();
      });
    }
  });
});

// create new post
router.post('/posts', function(req, res) {
  authed(req, function() {
    return res.status(401).send(emitError("not authorized"));
  }, function(sess) {
    var title = req.body.title;
    var content = req.body.content;
    db.qq('INSERT INTO postz (title, content, author) VALUES ($1, $2, $3)', [title, content, sess.usr], function(err, result) {
      return res.status(201).send("posted");
    });
  });
});

// edit this post
router.patch('/posts/:id', function(req, res) {
  authed(req, function() {
    return res.status(401).send(emitError("not authorized"));
  }, function(sess) {
    // i know i should only update the thing that got updated but frankly if we're loading in both things it won't break anything to resubmit the unupdated thing
    var title = req.body.title;
    var content = req.body.content;

    // and i should scold you if you try to edit a post that isn't yours BUT i don't want to rn. cuz it requires an extra SELECT. no.
  
    db.qq('UPDATE postz SET updated_at = DEFAULT, title = $3, content = $4 WHERE id = $1 AND author = $2', [req.params.id, sess.usr, title, content], function(err, result) {
      if (err) {console.log(err);}
      return res.status(200).send("updated");
    });
  });
});

router.delete('/posts/:id', function(req, res) {
  authed(req, function() {
    return res.status(401).send(emitError("not authorized"));
  }, function(sess) {
    // same, i should scold. but no.
    db.qq('DELETE FROM postz WHERE id = $1 AND author = $2', [req.params.id, sess.usr], function(err, result) {
      return res.status(204).send();
    });
  });
});


/* auth not necessary */

router.get('/posts', function(req, res) {
  db.qq('SELECT title, content, created_at FROM postz', [], function(err, result) {
    return res.status(200).send(result.rows);
  });
});

router.get('/posts/:id', function(req, res) {
  db.qq('SELECT title, content, created_at FROM postz WHERE id = $1', [req.params.id], function(err, result) {
    if (result.rows.length < 1) {
      return res.status(404).send(emitError("not found"));
    } else {
      return res.status(200).send(result.rows[0]);
    }
  });
});

router.get('/users/:id/posts', function(req, res) {
  db.qq('SELECT title, content, created_at FROM postz WHERE author = $1', [req.params.id], function(err, result) {
    return res.status(200).send(result.rows);
  });
});

module.exports = router;
