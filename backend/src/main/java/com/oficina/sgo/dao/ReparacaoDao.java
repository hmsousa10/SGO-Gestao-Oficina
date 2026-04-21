package com.oficina.sgo.dao;

import com.oficina.sgo.model.Reparacao;
import jakarta.persistence.EntityManager;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public class ReparacaoDao {

    public List<Reparacao> findAll(EntityManager em) {
        return em.createQuery("SELECT r FROM Reparacao r", Reparacao.class).getResultList();
    }

    public Optional<Reparacao> findById(EntityManager em, Long id) {
        return Optional.ofNullable(em.find(Reparacao.class, id));
    }

    public List<Reparacao> findByMecanicoId(EntityManager em, Long mecanicoId) {
        return em.createQuery(
                "SELECT r FROM Reparacao r WHERE r.mecanico.id = :mid", Reparacao.class)
                .setParameter("mid", mecanicoId).getResultList();
    }

    public long countAtivas(EntityManager em) {
        return em.createQuery(
                "SELECT COUNT(r) FROM Reparacao r WHERE r.estado IN ('EM_EXECUCAO', 'EM_PROGRESSO')", Long.class)
                .getSingleResult();
    }

    public List<Reparacao> findConcluidasNoPeriodo(EntityManager em, LocalDateTime inicio, LocalDateTime fim) {
        return em.createQuery(
                "SELECT r FROM Reparacao r WHERE r.dataFim >= :inicio AND r.dataFim <= :fim AND r.estado = 'CONCLUIDA'",
                Reparacao.class)
                .setParameter("inicio", inicio).setParameter("fim", fim).getResultList();
    }

    public Reparacao save(EntityManager em, Reparacao r) {
        if (r.getId() == null) {
            em.persist(r);
            return r;
        }
        return em.merge(r);
    }
}
