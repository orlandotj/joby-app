-- Script para limpar todos os dados do JOBY (zerar produção)
-- Execute com cuidado! Remove todos os registros das principais tabelas

DELETE FROM public.posts;
DELETE FROM public.profiles;
DELETE FROM public.photos;
DELETE FROM public.videos;
DELETE FROM public.services;
DELETE FROM public.bookings;
DELETE FROM public.reviews;
DELETE FROM public.follows;
DELETE FROM public.video_likes;
DELETE FROM public.photo_likes;
DELETE FROM public.comments;
-- Limpeza de dados de carteira e pagamentos (ajuste os nomes das tabelas se necessário)
-- DELETE FROM public.wallet;
-- DELETE FROM public.wallet_transactions;
-- DELETE FROM public.payment_methods;
-- DELETE FROM public.withdrawals;
-- DELETE FROM public.deposits;
-- Adicione outras tabelas se necessário
