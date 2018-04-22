package server

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/websocket"
)

type socketServer struct {
	clients     []*websocket.Conn
	upgrader    websocket.Upgrader
	totalShards int
	updateList  chan shardUpdate
}

func newSocketServer() *socketServer {
	totalShards, err := strconv.ParseInt(os.Getenv("BOT_SHARDS"), 10, 32)
	if err != nil {
		log.Panicln(err)
	}

	return &socketServer{
		clients:     make([]*websocket.Conn, 0),
		upgrader:    websocket.Upgrader{},
		totalShards: int(totalShards),
		updateList:  make(chan shardUpdate, 128),
	}
}

func (s *socketServer) socketUpgrader(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		w.WriteHeader(500)
		return
	}
	s.sayHello(conn)
	s.clients = append(s.clients, conn)

	closeHandler := func(code int, reason string) error {
		log.Println(conn.RemoteAddr(), "closed", code, "with", reason)
		s.die(conn)
		return nil
	}
	conn.SetCloseHandler(closeHandler)
}

func (s *socketServer) run() {
	// TODO: remove
	go s.testData()

	for {
		select {
		case u := <-s.updateList:
			log.Println("dequeued update", u)
			s.sayUpdate(u)
		}
	}
}

func (s *socketServer) sayHello(conn *websocket.Conn) {
	data := Message{
		Op: OpHello,
		Data: HelloMessage{
			TotalShards: s.totalShards,
		},
	}
	err := conn.WriteJSON(data)
	if err != nil {
		log.Println(err)
		s.die(conn)
	}
	log.Println(conn.RemoteAddr(), "opened and saluted")
}

func (s *socketServer) sayUpdate(u shardUpdate) {
	data := Message{
		Op: OpUpdate,
		Data: UpdateMessage{
			Shard:  u.ID,
			Status: u.Status,
		},
	}

	b, err := json.Marshal(data)
	if err != nil {
		log.Panicln(err)
	}

	pm, err := websocket.NewPreparedMessage(websocket.TextMessage, b)
	if err != nil {
		log.Panicln(err)
	}

	for _, c := range s.clients {
		err = c.WritePreparedMessage(pm)
		if err != nil {
			log.Println(err)
			s.die(c)
		}
	}
	log.Println("sent updates")
}

func (s *socketServer) die(conn *websocket.Conn) {
	conn.Close()
	// find index
	i := -1
	for idx, c := range s.clients {
		if c == conn {
			i = idx
			break
		}
	}
	if i == -1 {
		log.Println("failed to find index of socket")
		return
	}

	// reassign s.clients for brevity
	c := s.clients
	// swap conn with the back of the array
	// [0 1 2 3 4] removing 1 turns into [0 4 2 3 1]
	c[len(c)-1], c[i] = c[i], c[len(c)-1]
	// set clients to the array - 1
	// [0 4 2 3]
	s.clients = c[:len(c)-1]
}

// TODO: remove this for prod
func (s *socketServer) testData() {
	src := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(src)

	for {
		shard := rng.Intn(s.totalShards)
		status := rng.Intn(5)

		u := shardUpdate{
			ID:     shard,
			Status: status,
		}
		s.updateList <- u
		log.Println("built update", u)

		time.Sleep(time.Second * 1)
	}
}
